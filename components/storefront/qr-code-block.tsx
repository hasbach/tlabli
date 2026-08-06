"use client";

import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";

export function QRCodeBlock({ url, label }: { url: string; label: string }) {
  return (
    <Card className="inline-flex flex-col items-center gap-3 p-5">
      <CardContent className="flex flex-col items-center gap-3 p-0">
        <div className="rounded-lg bg-white p-3">
          <QRCodeSVG value={url} size={140} fgColor="#241608" />
        </div>
        <p className="text-center text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
