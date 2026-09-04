"use client";

import { Braces, ChevronDown, Download, FileText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createEvidenceReceipt,
  createEvidenceReceiptFilename,
  serializeEvidenceReceiptJson,
  type EvidenceReceiptFormat,
  type EvidenceReceiptSource,
} from "@/features/inspect/lib/evidence-receipt";
import { serializeEvidenceReceiptMarkdown } from "@/features/inspect/lib/evidence-receipt-markdown";

type EvidenceReceiptExportMenuProps = {
  source: EvidenceReceiptSource | null;
};

const downloadTextFile = (
  content: string,
  filename: string,
  mediaType: string,
) => {
  const url = URL.createObjectURL(
    new Blob([content], { type: `${mediaType};charset=utf-8` }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const EvidenceReceiptExportMenu = ({
  source,
}: EvidenceReceiptExportMenuProps) => {
  const exportReceipt = (format: EvidenceReceiptFormat) => {
    if (!source) return;

    const receipt = createEvidenceReceipt(source);
    const content =
      format === "json"
        ? serializeEvidenceReceiptJson(receipt)
        : serializeEvidenceReceiptMarkdown(receipt);
    const mediaType =
      format === "json" ? "application/json" : "text/markdown";

    downloadTextFile(
      content,
      createEvidenceReceiptFilename(receipt, format),
      mediaType,
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!source}
        className={buttonVariants({
          variant: "ghost",
          className:
            "min-h-10 px-0 text-base font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground",
        })}
      >
        <Download className="size-4" aria-hidden="true" />
        Export evidence receipt
        <ChevronDown className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-72 rounded-xl p-1.5"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 py-2">
            Download complete report
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="items-start gap-3 px-2.5 py-2.5"
            onClick={() => exportReceipt("json")}
          >
            <Braces className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <span>
              <span className="block font-medium">JSON</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Structured data for tools and automation
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start gap-3 px-2.5 py-2.5"
            onClick={() => exportReceipt("markdown")}
          >
            <FileText className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <span>
              <span className="block font-medium">Markdown</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                A polished report for people and documentation
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
