import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingBag, Plus, RefreshCw, ExternalLink } from "lucide-react";
import {
  listMerchantAccounts,
  listMerchantProducts,
  insertMerchantProduct,
  SAMPLE_PRODUCTS,
  getGoogleConnection,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard/merchant")({
  head: () => ({ meta: [{ title: "Merchant Center — Workspace" }] }),
  component: MerchantPage,
});

function MerchantPage() {
  const fetchConn = useServerFn(getGoogleConnection);
  const fetchAccounts = useServerFn(listMerchantAccounts);
  const fetchProducts = useServerFn(listMerchantProducts);
  const insertProduct = useServerFn(insertMerchantProduct);
  const qc = useQueryClient();
  const [merchantId, setMerchantId] = useState<string>("");

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

  const addSample = useMutation({
    mutationFn: async () => {
      for (const p of SAMPLE_PRODUCTS) {
        await insertProduct({ data: { merchantId, product: p } });
      }
    },
    onSuccess: () => {
      toast.success("Sample products added");
      qc.invalidateQueries({ queryKey: ["mc-products", merchantId] });
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
          {accounts.data?.connected && accounts.data.accounts.length > 0 && (
            <Select value={merchantId} onValueChange={setMerchantId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select merchant" />
              </SelectTrigger>
              <SelectContent>
                {accounts.data.accounts.map((a) => (
                  <SelectItem key={a.merchantId} value={a.merchantId}>
                    {a.name ?? `Merchant ${a.merchantId}`}
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
          <Button
            onClick={() => addSample.mutate()}
            disabled={!merchantId || addSample.isPending}
          >
            <Plus className="size-4 mr-1" />
            {addSample.isPending ? "Adding…" : "Add sample products"}
          </Button>
        </div>
      </div>

      {accounts.isLoading && <Skeleton className="h-10 w-full" />}

      {accounts.data?.connected && accounts.data.accounts.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          No Merchant Center accounts found for this Google account. Create one at{" "}
          <a
            href="https://merchants.google.com/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            merchants.google.com
          </a>
          .
        </Card>
      )}

      {merchantId && (
        <div>
          <h2 className="font-semibold mb-3">Products</h2>
          {products.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
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
                    {p.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2">
                      <span className="text-xs text-muted-foreground capitalize">
                        {p.availability ?? "—"}
                      </span>
                      {p.link && (
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No products yet. Click "Add sample products" to insert a few.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
