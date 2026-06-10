import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShoppingBag,
  Plus,
  RefreshCw,
  ExternalLink,
  MousePointerClick,
  Eye,
} from "lucide-react";
import {
  listMerchantAccounts,
  listMerchantProducts,
  insertMerchantProduct,
  getGoogleConnection,
  type MerchantProductInput,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard/merchant")({
  head: () => ({ meta: [{ title: "Merchant Center — Workspace" }] }),
  component: MerchantPage,
});

const EMPTY: MerchantProductInput = {
  offerId: "",
  title: "",
  description: "",
  link: "",
  imageLink: "",
  priceValue: "",
  priceCurrency: "USD",
  brand: "",
  availability: "in stock",
  condition: "new",
};

function statusVariant(s?: string): "default" | "secondary" | "destructive" | "outline" {
  if (!s) return "outline";
  const v = s.toLowerCase();
  if (v.includes("approved") || v === "active") return "default";
  if (v.includes("disapproved")) return "destructive";
  return "secondary";
}

function MerchantPage() {
  const fetchConn = useServerFn(getGoogleConnection);
  const fetchAccounts = useServerFn(listMerchantAccounts);
  const fetchProducts = useServerFn(listMerchantProducts);
  const insertProduct = useServerFn(insertMerchantProduct);
  const qc = useQueryClient();
  const [merchantId, setMerchantId] = useState<string>("");
  const [manualId, setManualId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MerchantProductInput>(EMPTY);

  const conn = useQuery({ queryKey: ["google-conn"], queryFn: () => fetchConn() });
  const hasContentScope = conn.data?.scope?.includes("content");

  const accounts = useQuery({
    queryKey: ["mc-accounts"],
    queryFn: () => fetchAccounts(),
    enabled: !!conn.data && !!hasContentScope,
  });

  useEffect(() => {
    if (accounts.data?.connected && accounts.data.accounts[0] && !merchantId) {
      setMerchantId(accounts.data.accounts[0].merchantId);
    }
  }, [accounts.data, merchantId]);

  const products = useQuery({
    queryKey: ["mc-products", merchantId],
    queryFn: () => fetchProducts({ data: { merchantId } }),
    enabled: !!merchantId,
  });

  const addProduct = useMutation({
    mutationFn: async (p: MerchantProductInput) =>
      insertProduct({ data: { merchantId, product: p } }),
    onSuccess: () => {
      toast.success("Product added to Merchant Center");
      qc.invalidateQueries({ queryKey: ["mc-products", merchantId] });
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!conn.data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <ShoppingBag className="mx-auto size-10 text-muted-foreground mb-3" />
          <h2 className="font-display text-xl mb-2">Connect Google</h2>
          <p className="text-sm text-muted-foreground">
            Connect your Google account in Settings to use Merchant Center.
          </p>
        </Card>
      </div>
    );
  }

  if (!hasContentScope) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <ShoppingBag className="mx-auto size-10 text-muted-foreground mb-3" />
          <h2 className="font-display text-xl mb-2">Reconnect required</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Merchant Center access needs an additional scope. Please disconnect and
            reconnect Google from Settings.
          </p>
        </Card>
      </div>
    );
  }

  const hasAccounts = accounts.data?.connected && accounts.data.accounts.length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantId) return toast.error("Select a Merchant ID first");
    addProduct.mutate(form);
  };

  const set = <K extends keyof MerchantProductInput>(k: K, v: MerchantProductInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl flex items-center gap-2">
            <ShoppingBag className="size-6" /> Merchant Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your Google Merchant Center products.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAccounts && (
            <Select value={merchantId} onValueChange={setMerchantId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select merchant" />
              </SelectTrigger>
              <SelectContent>
                {accounts.data!.accounts.map((a) => (
                  <SelectItem key={a.merchantId} value={a.merchantId}>
                    <span className="flex flex-col">
                      <span>{a.name ?? `Merchant ${a.merchantId}`}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        ID: {a.merchantId}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => products.refetch()}
            disabled={!merchantId}
          >
            <RefreshCw className="size-4" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!merchantId}>
                <Plus className="size-4 mr-1" /> Add product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add product to Merchant Center</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Title *</Label>
                  <Input
                    required
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Offer ID *</Label>
                  <Input
                    required
                    value={form.offerId}
                    onChange={(e) => set("offerId", e.target.value)}
                    placeholder="unique-sku-001"
                  />
                </div>
                <div>
                  <Label>Brand *</Label>
                  <Input
                    required
                    value={form.brand}
                    onChange={(e) => set("brand", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Description *</Label>
                  <Textarea
                    required
                    rows={3}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Product link *</Label>
                  <Input
                    required
                    type="url"
                    value={form.link}
                    onChange={(e) => set("link", e.target.value)}
                    placeholder="https://example.com/product"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Image link *</Label>
                  <Input
                    required
                    type="url"
                    value={form.imageLink}
                    onChange={(e) => set("imageLink", e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div>
                  <Label>Price *</Label>
                  <Input
                    required
                    placeholder="29.99"
                    value={form.priceValue}
                    onChange={(e) => set("priceValue", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Currency *</Label>
                  <Input
                    required
                    maxLength={3}
                    value={form.priceCurrency}
                    onChange={(e) => set("priceCurrency", e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <Label>Availability</Label>
                  <Select
                    value={form.availability}
                    onValueChange={(v) =>
                      set("availability", v as MerchantProductInput["availability"])
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in stock">In stock</SelectItem>
                      <SelectItem value="out of stock">Out of stock</SelectItem>
                      <SelectItem value="preorder">Preorder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Condition</Label>
                  <Select
                    value={form.condition}
                    onValueChange={(v) =>
                      set("condition", v as MerchantProductInput["condition"])
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="refurbished">Refurbished</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="col-span-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addProduct.isPending}>
                    {addProduct.isPending ? "Adding…" : "Add to Merchant Center"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Merchant accounts list with IDs */}
      {accounts.isLoading && <Skeleton className="h-20 w-full" />}
      {hasAccounts && (
        <Card className="p-4">
          <h3 className="font-medium text-sm mb-2">Your Merchant Center accounts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {accounts.data!.accounts.map((a) => (
              <button
                key={a.merchantId}
                onClick={() => setMerchantId(a.merchantId)}
                className={`text-left p-3 rounded-md border transition ${
                  merchantId === a.merchantId
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <div className="font-medium text-sm">
                  {a.name ?? `Merchant ${a.merchantId}`}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  ID: {a.merchantId}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {accounts.error && (
        <Card className="p-4 border-destructive/50 bg-destructive/5">
          <h3 className="font-medium text-sm text-destructive">
            Could not auto-detect Merchant Center
          </h3>
          <p className="text-xs text-muted-foreground mt-1 break-all">
            {(accounts.error as Error).message}
          </p>
        </Card>
      )}

      {/* Manual ID input */}
      <Card className="p-4 space-y-3">
        <div>
          <h3 className="font-medium text-sm">
            {hasAccounts ? "Or use a different Merchant ID" : "Enter Merchant ID manually"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Find your ID at{" "}
            <a
              href="https://merchants.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              merchants.google.com
            </a>
            {merchantId && (
              <> · Currently using: <span className="font-mono">{merchantId}</span></>
            )}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="mid" className="text-xs">Merchant ID</Label>
            <Input
              id="mid"
              placeholder="e.g. 1234567890"
              value={manualId}
              onChange={(e) => setManualId(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <Button
            onClick={() => setMerchantId(manualId)}
            disabled={!manualId || manualId === merchantId}
          >
            Use this ID
          </Button>
        </div>
      </Card>

      {products.error && merchantId && (
        <Card className="p-4 border-destructive/50 bg-destructive/5">
          <h3 className="font-medium text-sm text-destructive">Merchant Center API error</h3>
          <p className="text-xs text-muted-foreground mt-1 break-all whitespace-pre-wrap">
            {(products.error as Error).message}
          </p>
        </Card>
      )}

      {merchantId && (
        <div>
          <h2 className="font-semibold mb-3">Your Merchant Center products</h2>
          {products.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          ) : products.data && products.data.products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.data.products.map((p) => (
                <Card key={p.id} className="overflow-hidden flex flex-col">
                  {p.imageLink && (
                    <img
                      src={p.imageLink}
                      alt={p.title}
                      className="w-full h-40 object-cover"
                    />
                  )}
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium line-clamp-2">{p.title}</h3>
                      {p.price && (
                        <Badge variant="secondary">
                          {p.price.value} {p.price.currency}
                        </Badge>
                      )}
                    </div>
                    {p.brand && (
                      <p className="text-xs text-muted-foreground">{p.brand}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {p.status && (
                        <Badge variant={statusVariant(p.status)} className="capitalize">
                          {p.status}
                        </Badge>
                      )}
                      {p.issues ? (
                        <Badge variant="destructive">{p.issues} issues</Badge>
                      ) : null}
                      {p.availability && (
                        <span className="text-xs text-muted-foreground capitalize">
                          {p.availability}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-2 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <MousePointerClick className="size-3" />
                        {p.clicks ?? 0} clicks
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3" />
                        {p.impressions ?? 0} views
                      </span>
                      <span className="text-muted-foreground/70 ml-auto">30d</span>
                    </div>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary inline-flex items-center gap-1 mt-auto pt-2"
                      >
                        View product <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No products yet. Click <strong>Add product</strong> to create one.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
