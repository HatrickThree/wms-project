"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const GuardContext = createContext<{
  setDirty: (value: boolean) => void;
  navigate: (url: string) => void;
}>({ setDirty: () => {}, navigate: () => {} });
export function NavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const navigate = useCallback(
    (url: string) => {
      if (dirty) setDestination(url);
      else router.push(url);
    },
    [dirty, router],
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
    <GuardContext.Provider value={{ setDirty, navigate }}>
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
          const anchor = (event.target as HTMLElement).closest("a");
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
          setDestination(anchor.href);
        }}
      >
        {children}
      </div>
      <AlertDialog
        open={!!destination}
        onOpenChange={(open) => {
          if (!open) setDestination(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>มีรายการที่ยังไม่บันทึก</AlertDialogTitle>
          <AlertDialogDescription>
            หากออกจากหน้านี้ ข้อมูลที่กำลังกรอกและรายการสแกนในรอบนี้จะหายไป
            ต้องการทำต่อหรือออกจากหน้านี้?
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>กลับไปทำต่อ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const url = destination;
                setDirty(false);
                setDestination(null);
                if (url) router.push(url);
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
