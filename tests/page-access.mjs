import assert from "node:assert/strict";
import { canAccessPage, homePage } from "../src/lib/page-access.ts";
const profile = (role, type = "TRAINING", trainingRound = null) => ({
  user: { id: "qa", username: "qa", displayName: "QA", role },
  workspace: type ? { id: "qa", name: "QA", code: "QA", type } : null,
  trainingRound,
});
for (const role of ["ADMIN", "STAFF", "INSTRUCTOR", "STUDENT"]) {
  const p = profile(role, null);
  assert.equal(canAccessPage(p, "/workspaces"), true);
  assert.equal(canAccessPage(p, "/account"), true);
  assert.equal(canAccessPage(p, "/inventory"), false);
  assert.equal(canAccessPage(p, "/admin/users"), role === "ADMIN");
}
assert.equal(canAccessPage(profile("STAFF", "BUSINESS"), "/catalog"), true);
assert.equal(canAccessPage(profile("STAFF", "BUSINESS"), "/research"), false);
assert.equal(canAccessPage(profile("INSTRUCTOR"), "/research"), true);
assert.equal(canAccessPage(profile("INSTRUCTOR"), "/admin/users"), false);
assert.equal(
  canAccessPage(profile("INSTRUCTOR", "BUSINESS"), "/inventory"),
  false,
);
for (const status of ["READY", "SUBMITTED", "REVIEWED"]) {
  const p = profile("STUDENT", "TRAINING", { status, task: "PICK" });
  assert.equal(canAccessPage(p, "/training"), true);
  assert.equal(canAccessPage(p, "/stock"), false);
  assert.equal(canAccessPage(p, "/outbound"), false);
}
const paths = [
  "/inbound",
  "/outbound",
  "/transfers",
  "/counts",
  "/stock",
  "/maps",
  "/catalog",
];
for (const [task, allowed] of [
  ["RECEIVE", ["/inbound", "/stock"]],
  ["PICK", ["/outbound", "/stock", "/maps"]],
  ["PUTAWAY", ["/transfers", "/stock"]],
  ["COUNT", ["/counts"]],
]) {
  const p = profile("STUDENT", "TRAINING", { status: "ACTIVE", task });
  for (const path of paths)
    assert.equal(
      canAccessPage(p, path),
      allowed.includes(path),
      `${task}: ${path}`,
    );
}
assert.equal(homePage("STUDENT"), "/training");
assert.equal(homePage("ADMIN"), "/");
console.log(
  "PASS: menu/page visibility follows roles, missing workspace, round status and task; blind count never exposes stock links",
);
