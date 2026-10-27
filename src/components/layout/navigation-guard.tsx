"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
type Intent =
  | { kind: "navigation"; href: string }
  | { kind: "action"; run: () => void };
const GuardContext = createContext<{
  setDirty: (value: boolean) => void;
  navigate: (url: string) => void;
  perform: (action: () => void) => void;
}>({ setDirty: () => {}, navigate: () => {}, perform: () => {} });
export function NavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const navigate = useCallback(
    (href: string) => {
      if (dirty) setIntent({ kind: "navigation", href });
      else router.push(href);
    },
    [dirty, router],
  );
  const perform = useCallback(
    (run: () => void) => {
      if (dirty) setIntent({ kind: "action", run });
      else run();
    },
    [dirty],
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  return (
    <GuardContext.Provider value={{ setDirty, navigate, perform }}>
      <div
        onClickCapture={(event) => {
          if (
            !dirty ||
            event.defaultPrevented ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          )
            return;
          const anchor =
            event.target instanceof Element ? event.target.closest("a") : null;
          if (
            !anchor ||
            anchor.target === "_blank" ||
            anchor.hasAttribute("download")
          )
            return;
          const url = new URL(anchor.href, window.location.href);
          if (
            url.origin === window.location.origin &&
            url.pathname === window.location.pathname &&
            url.search === window.location.search
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          setIntent({ kind: "navigation", href: anchor.href });
        }}
      >
        {children}
      </div>
      <AlertDialog
        open={!!intent}
        onOpenChange={(open) => {
          if (!open) setIntent(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>มีรายการที่ยังไม่บันทึก</AlertDialogTitle>
          <AlertDialogDescription>
            หากเปลี่ยนหน้าหรือออกจากระบบ
            ข้อมูลที่กำลังกรอกและรายการสแกนในรอบนี้จะหายไป
            ต้องการทำต่อหรือออกจากหน้านี้?
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>กลับไปทำต่อ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = intent;
                setDirty(false);
                setIntent(null);
                if (next?.kind === "action") next.run();
                else if (next) router.push(next.href);
              }}
            >
              ออกจากหน้านี้
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardContext.Provider>
  );
}
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useContext(GuardContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
export function useGuardedNavigation() {
  return useContext(GuardContext).navigate;
}
export function useGuardedAction() {
  return useContext(GuardContext).perform;
}
