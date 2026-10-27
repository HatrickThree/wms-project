"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { CameraScanner } from "./camera-scanner";

interface ScanInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
  onScanValue: (value: string) => void | Promise<void>;
  scannerTitle: string;
  scannerEnabled?: boolean;
}

export const ScanInput = React.forwardRef<HTMLInputElement, ScanInputProps>(
  ({ onScanValue, scannerTitle, scannerEnabled = true, ...props }, ref) => (
    <div className="flex w-full min-w-0 flex-1 items-stretch gap-2 [&>button]:h-auto">
      <Input ref={ref} {...props} />
      {scannerEnabled && (
        <CameraScanner
          onScan={onScanValue}
          disabled={props.disabled}
          title={scannerTitle}
          focusTarget={props.id}
        />
      )}
    </div>
  ),
);
ScanInput.displayName = "ScanInput";
