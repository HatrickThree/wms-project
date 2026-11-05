import type { SessionProfile } from "./session-types";

// Shared by navigation and page guards; API permissions remain authoritative.
export function canAccessPage(profile: SessionProfile, path: string) {
  const { role } = profile.user;
  if (["/account", "/workspaces"].includes(path)) return true;
  if (path === "/admin/users") return role === "ADMIN";
  if (!profile.workspace) return false;
  if (role === "STAFF" && profile.workspace.type !== "BUSINESS") return false;
  if (
    ["INSTRUCTOR", "STUDENT"].includes(role) &&
    profile.workspace.type !== "TRAINING"
  )
    return false;
  if (["/training", "/research"].includes(path))
    return profile.workspace.type === "TRAINING";
  if (role !== "STUDENT") return true;
  const round = profile.trainingRound;
  if (round?.status !== "ACTIVE") return false;
  if (round.task === "COUNT") return path === "/counts";
  if (
    [
      "/inventory",
      "/stock",
      "/serials",
      "/labels",
      "/abc",
      "/activity",
    ].includes(path)
  )
    return true;
  return (
    (round.task === "RECEIVE" && path === "/inbound") ||
    (round.task === "PUTAWAY" && path === "/transfers") ||
    (round.task === "PICK" && ["/outbound", "/maps"].includes(path))
  );
}

export function homePage(role: SessionProfile["user"]["role"]) {
  return role === "STUDENT" ? "/training" : "/";
}
