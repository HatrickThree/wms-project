import assert from "node:assert/strict";
import {randomUUID,randomBytes,scryptSync} from "node:crypto";
import {PrismaClient} from "@prisma/client";
if(process.env.ALLOW_DISPOSABLE_DATABASE!=="1"||!/(test|qa)[^/\\]*\.db$/i.test(process.env.DATABASE_URL||""))throw new Error("Disposable QA database required");
const db=new PrismaClient();const base=process.env.TEST_BASE_URL||"http://127.0.0.1:3004";assert.ok(["localhost","127.0.0.1"].includes(new URL(base).hostname));
const key=()=>randomUUID();
function agent(){const jar=new Map();return{async call(path,{method="GET",body,status=200,workspace,origin=base}={}){const r=await fetch(base+path,{method,headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join("; "),...(workspace?{"X-Workspace-Id":workspace}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});for(const c of r.headers.getSetCookie()){const [p]=c.split(";");const i=p.indexOf("=");jar.set(p.slice(0,i),p.slice(i+1))}const j=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(j)}`);return j.data??j}}}
async function fixture(name,role){const password=randomBytes(24).toString("hex"),salt=randomBytes(16).toString("hex");const user=await db.user.create({data:{username:`qa.delete.${name}`,displayName:`QA Delete ${name}`,role,passwordHash:`scrypt$${salt}$${scryptSync(password,salt,64).toString("hex")}`}});const a=agent();await a.call("/api/auth/login",{method:"POST",body:{username:user.username,password}});return{...a,user,password}}
const removals=()=>db.$queryRaw`SELECT * FROM "WorkspaceDeletion"`;
try{
 const users=await db.user.findMany();assert.ok(users.length&&users.every(u=>u.username.startsWith("qa.")));assert.equal((await removals()).length,0);
 const admin=await fixture("admin","ADMIN"),staff=await fixture("staff","STAFF"),teacher=await fixture("teacher","INSTRUCTOR"),student=await fixture("student","STUDENT");
 const business=await admin.call("/api/workspaces",{method:"POST",status:201,body:{type:"BUSINESS",name:"QA Delete Business"}}),training=await admin.call("/api/workspaces",{method:"POST",status:201,body:{type:"TRAINING",name:"QA Delete Training"}});
 await admin.call(`/api/workspaces/${business.id}/members`,{method:"POST",body:{userId:staff.user.id}});
 for(const person of [teacher,student])await admin.call(`/api/workspaces/${training.id}/members`,{method:"POST",body:{userId:person.user.id}});
 const switchTo=(a,workspaceId)=>a.call("/api/workspaces/switch",{method:"POST",body:{workspaceId}});
 await switchTo(admin,business.id);await switchTo(staff,business.id);await switchTo(teacher,training.id);await switchTo(student,training.id);
 const post=(path,body,status=201)=>admin.call(path,{method:"POST",workspace:business.id,body,status});
 const wh=await post("/api/catalog",{kind:"warehouse",code:"DEL-WH",name:"QA Delete Warehouse"});const location=await post("/api/catalog",{kind:"location",warehouseId:wh.id,barcode:"DEL-A",zone:"D",aisle:"1",rack:"1",level:"1",type:"STORAGE"});
 const product=await post("/api/catalog",{kind:"product",sku:"DEL-SKU",barcode:"DEL-BAR",name:"QA Delete Stock",baseUom:"ชิ้น",minStock:0,trackSerial:false,trackLot:false,issuePolicy:"FIFO"});
 await post("/api/receipts",{operationId:key(),referenceDoc:"DEL-RECEIPT",sku:product.sku,quantity:4,locationBarcode:location.barcode},200);
 const before={balances:await db.inventoryBalance.findMany({where:{workspaceId:business.id}}),layers:await db.stockLayer.findMany({where:{workspaceId:business.id}}),ledger:await db.stockLedger.findMany({where:{workspaceId:business.id}}),members:await db.workspaceMember.findMany({where:{workspaceId:business.id}})};
 const deletion={operationId:key(),confirmName:"QA Delete Business",password:admin.password};const url=`/api/workspaces/${business.id}`;
 await agent().call(url,{method:"DELETE",body:deletion,status:401});
 for(const actor of [staff,teacher,student]){await actor.call(url,{method:"DELETE",body:deletion,status:403});await actor.call(url,{method:"POST",body:{operationId:key(),confirmName:deletion.confirmName,deletedAt:new Date().toISOString()},status:403});await actor.call("/api/workspaces?deleted=1",{status:403})}
 await admin.call(url,{method:"DELETE",body:deletion,origin:"https://outside.invalid",status:403});
 await admin.call(url,{method:"DELETE",body:{operationId:key(),confirmName:deletion.confirmName},status:400});
 await admin.call(url,{method:"DELETE",body:{...deletion,password:"wrong-password"},status:400});assert.equal((await removals()).length,0);
 await admin.call(url,{method:"DELETE",body:{...deletion,confirmName:"wrong name"},status:409});assert.equal((await removals()).length,0);
 await admin.call(url,{method:"DELETE",body:deletion});await admin.call(url,{method:"DELETE",body:deletion});assert.equal((await removals()).length,1);
 assert.equal((await admin.call("/api/workspaces")).activeWorkspaceId,null);assert.ok(!(await admin.call("/api/workspaces")).workspaces.some(w=>w.id===business.id));assert.ok(!(await staff.call("/api/workspaces")).workspaces.some(w=>w.id===business.id));
 await admin.call("/api/workspaces/switch",{method:"POST",body:{workspaceId:business.id},status:403});await staff.call("/api/stock",{workspace:business.id,status:409});
 await db.userSession.updateMany({where:{userId:staff.user.id},data:{activeWorkspaceId:business.id}});await staff.call("/api/stock",{workspace:business.id,status:403});await staff.call("/api/receipts",{method:"POST",workspace:business.id,body:{},status:403});await db.userSession.updateMany({where:{userId:staff.user.id},data:{activeWorkspaceId:null}});
 await admin.call(`/api/workspaces/${business.id}/members`,{status:403});
 const deleted=(await admin.call("/api/workspaces?deleted=1")).workspaces.find(w=>w.id===business.id);assert.equal(deleted.deletion.deletedBy,admin.user.username);assert.ok(!Number.isNaN(new Date(deleted.deletion.deletedAt).getTime()));
 const restore={operationId:key(),confirmName:deletion.confirmName,deletedAt:deleted.deletion.deletedAt};
 await admin.call(url,{method:"POST",body:{...restore,deletedAt:"2000-01-01T00:00:00.000Z"},status:409});await admin.call(url,{method:"POST",body:restore});await admin.call(url,{method:"POST",body:restore});assert.equal((await removals()).length,0);
 assert.ok((await staff.call("/api/workspaces")).workspaces.some(w=>w.id===business.id));assert.equal((await staff.call("/api/workspaces")).activeWorkspaceId,null);await switchTo(staff,business.id);const stock=await staff.call("/api/stock",{workspace:business.id});assert.equal(stock.totals.qtyOnHand,4);
 await admin.call(url,{method:"DELETE",body:deletion});assert.equal((await removals()).length,0,"Retry of old delete must not undo a later restore");
 await admin.call(url,{method:"DELETE",body:{...deletion,operationId:key()}});await admin.call(url,{method:"POST",body:{...restore,operationId:key()},status:409});const current=(await admin.call("/api/workspaces?deleted=1")).workspaces.find(w=>w.id===business.id);await admin.call(url,{method:"POST",body:{...restore,operationId:key(),deletedAt:current.deletion.deletedAt}});
 assert.deepEqual(await db.inventoryBalance.findMany({where:{workspaceId:business.id}}),before.balances);assert.deepEqual(await db.stockLayer.findMany({where:{workspaceId:business.id}}),before.layers);assert.deepEqual(await db.stockLedger.findMany({where:{workspaceId:business.id}}),before.ledger);assert.deepEqual(await db.workspaceMember.findMany({where:{workspaceId:business.id}}),before.members);
 const round=await db.trainingRound.findFirst();assert.ok(round);const roundBefore=await db.trainingRound.findUnique({where:{id:round.id}});const workspace=await db.workspace.findUnique({where:{id:round.workspaceId}});const delRound={operationId:key(),confirmName:workspace.name,password:admin.password};await admin.call(`/api/workspaces/${workspace.id}`,{method:"DELETE",body:delRound});
 const lesson=await db.trainingLesson.findUnique({where:{id:round.lessonId}});await switchTo(admin,lesson.workspaceId);let view=await admin.call("/api/training",{workspace:lesson.workspaceId});assert.ok(!view.lessons.flatMap(l=>l.rounds).some(r=>r.id===round.id));
 const removedRound=(await admin.call("/api/workspaces?deleted=1")).workspaces.find(w=>w.id===workspace.id);await admin.call(`/api/workspaces/${workspace.id}`,{method:"POST",body:{operationId:key(),confirmName:workspace.name,deletedAt:removedRound.deletion.deletedAt}});view=await admin.call("/api/training",{workspace:lesson.workspaceId});assert.ok(view.lessons.flatMap(l=>l.rounds).some(r=>r.id===round.id));assert.deepEqual(await db.trainingRound.findUnique({where:{id:round.id}}),roundBefore);
 const audit=await db.operationalEvent.findMany({where:{type:{in:["workspace.delete","workspace.restore"]}}});assert.ok(audit.length>=6);for(const row of audit){assert.equal(row.actor,admin.user.username);assert.ok(!row.detailsJson.includes(admin.password));assert.ok(!row.detailsJson.includes('"password"'))}
 for(let i=0;i<5;i++)await admin.call(url,{method:"DELETE",body:{...deletion,operationId:key(),password:"incorrect"},status:400});await admin.call(url,{method:"DELETE",body:{...deletion,operationId:key()},status:429});assert.equal((await removals()).length,0);
 assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"),[]);
 console.log("PASS: admin-only delete/restore, password reauthentication and throttling, exact-name confirmation, CSRF, hidden deleted workspaces, active/stale session blocking, retry safety across restore/re-delete, preserved stock/members/results, restored round visibility and no password in audit.");
}finally{await db.$disconnect()}
