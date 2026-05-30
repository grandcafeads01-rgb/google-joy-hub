import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  HardDrive,
  Folder,
  FileText,
  Upload,
  FolderPlus,
  Download,
  ExternalLink,
  ChevronRight,
  Home,
  Link2,
} from "lucide-react";
import {
  listDriveFiles,
  createDriveFolder,
  uploadDriveFile,
  downloadDriveFile,
  type DriveFile,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Crumb {
  id: string;
  name: string;
}

export const Route = createFileRoute("/_authenticated/dashboard/drive")({
  head: () => ({ meta: [{ title: "Drive — Workspace" }] }),
  component: DrivePage,
});

function DrivePage() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: "root", name: "My Drive" }]);
  const currentFolder = crumbs[crumbs.length - 1];

  const fetchDrive = useServerFn(listDriveFiles);
  const createFolder = useServerFn(createDriveFolder);
  const upload = useServerFn(uploadDriveFile);
  const download = useServerFn(downloadDriveFile);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["drive", currentFolder.id],
    queryFn: () => fetchDrive({ data: { folderId: currentFolder.id } }),
  });

  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const createFolderMutation = useMutation({
    mutationFn: () => createFolder({ data: { name: folderName, parentId: currentFolder.id } }),
    onSuccess: () => {
      toast.success(`Folder “${folderName}” created`);
      setFolderOpen(false);
      setFolderName("");
      qc.invalidateQueries({ queryKey: ["drive"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      return upload({
        data: {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: base64,
          parentId: currentFolder.id === "root" ? undefined : currentFolder.id,
        },
      });
    },
    onSuccess: (_d, file) => {
      toast.success(`Uploaded “${file.name}”`);
      qc.invalidateQueries({ queryKey: ["drive"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const downloadMutation = useMutation({
    mutationFn: (f: DriveFile) => download({ data: { fileId: f.id } }),
    onSuccess: (res) => {
      const bytes = base64ToBytes(res.base64);
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed"),
  });

  if (!isLoading && data && !data.connected) {
    return (
      <div className="p-8 max-w-2xl">
        <Card className="p-8 text-center space-y-4">
          <div className="size-14 rounded-2xl bg-[color:var(--color-drive)]/10 text-[color:var(--color-drive)] grid place-items-center mx-auto">
            <HardDrive className="size-7" />
          </div>
          <h2 className="font-display text-xl font-semibold">Connect Drive</h2>
          <p className="text-muted-foreground">Link your Google account to browse Drive.</p>
          <Button asChild>
            <Link to="/dashboard/settings">
              <Link2 className="size-4 mr-2" /> Open Settings
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  const openFolder = (f: DriveFile) => setCrumbs([...crumbs, { id: f.id, name: f.name }]);
  const navTo = (i: number) => setCrumbs(crumbs.slice(0, i + 1));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-3">
            <HardDrive className="size-7 text-[color:var(--color-drive)]" /> Drive
          </h1>
          <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1 flex-wrap">
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                <button
                  onClick={() => navTo(i)}
                  className="hover:text-foreground hover:underline flex items-center gap-1"
                >
                  {i === 0 && <Home className="size-3" />}
                  {c.name}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <FolderPlus className="size-4 mr-2" /> New folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New folder</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="fname">Name</Label>
                <Input
                  id="fname"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Untitled folder"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setFolderOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createFolderMutation.mutate()}
                  disabled={!folderName.trim() || createFolderMutation.isPending}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            onClick={() => fileInput.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload className="size-4 mr-2" />
            {uploadMutation.isPending ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMutation.mutate(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <Card>
        {isLoading && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {data?.connected && data.files.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Folder className="size-10 mx-auto mb-2 opacity-50" />
            This folder is empty.
          </div>
        )}
        {data?.connected &&
          data.files.map((f) => {
            const isFolder = f.mimeType === "application/vnd.google-apps.folder";
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 border-b last:border-0 hover:bg-accent/40 transition-colors"
              >
                <div
                  className={`size-9 rounded-lg grid place-items-center shrink-0 ${
                    isFolder
                      ? "bg-[color:var(--color-drive)]/10 text-[color:var(--color-drive)]"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isFolder ? <Folder className="size-4" /> : <FileText className="size-4" />}
                </div>
                {isFolder ? (
                  <button
                    onClick={() => openFolder(f)}
                    className="flex-1 text-left truncate font-medium hover:underline"
                  >
                    {f.name}
                  </button>
                ) : (
                  <div className="flex-1 truncate font-medium">{f.name}</div>
                )}
                <div className="hidden sm:block text-xs text-muted-foreground">
                  {new Date(f.modifiedTime).toLocaleDateString()}
                </div>
                <div className="flex gap-1">
                  {!isFolder && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => downloadMutation.mutate(f)}
                      disabled={downloadMutation.isPending}
                      title="Download"
                    >
                      <Download className="size-4" />
                    </Button>
                  )}
                  {f.webViewLink && (
                    <Button size="icon" variant="ghost" asChild title="Open in Drive">
                      <a href={f.webViewLink} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </Card>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
