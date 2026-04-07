import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProductDetailDialog, { type ProductData } from "@/components/ProductDetailDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useMemo, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Search,
  Download,
  Loader2,
  Package,
  Globe,
  CheckCircle2,
  XCircle,
  Eye,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Image as ImageIcon,
  LogIn,
  Star,
  RefreshCw,
  RotateCcw,
  Shield,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  History,
  TrendingUp,
} from "lucide-react";

const BATCH_SIZE = 3;
const PAGE_SIZE_OPTIONS = [30, 60, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [asinInput, setAsinInput] = useState("");
  const [marketplace, setMarketplace] = useState("US");
  const [products, setProducts] = useState<ProductData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Batch progress state
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0, currentBatch: 0, totalBatches: 0 });
  const abortRef = useRef(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(30);

  const { data: marketplaces } = trpc.scraper.getMarketplaces.useQuery();
  const scrapeMutation = trpc.scraper.quickScrape.useMutation();
  const resetSessionMutation = trpc.scraper.resetSession.useMutation();

  const asins = useMemo(() => {
    return asinInput
      .split(/[\n,;\s]+/)
      .map(a => a.trim().toUpperCase())
      .filter(a => a.length > 0);
  }, [asinInput]);

  const validAsins = useMemo(() => {
    return asins.filter(a => /^[A-Z0-9]{10}$/.test(a));
  }, [asins]);

  // Paginated products
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return products.slice(start, start + pageSize);
  }, [products, currentPage, pageSize]);

  const handlePageSizeChange = useCallback((size: PageSize) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const handleScrape = useCallback(async () => {
    if (validAsins.length === 0) {
      toast.error("请输入有效的ASIN", {
        description: "ASIN应为10位字母数字组合，如 B0XXXXXXXXX",
      });
      return;
    }

    setIsLoading(true);
    setProducts([]);
    setCurrentPage(1);
    abortRef.current = false;

    const batches: string[][] = [];
    for (let i = 0; i < validAsins.length; i += BATCH_SIZE) {
      batches.push(validAsins.slice(i, i + BATCH_SIZE));
    }

    setBatchProgress({ completed: 0, total: validAsins.length, currentBatch: 0, totalBatches: batches.length });

    const allResults: ProductData[] = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    try {
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        if (abortRef.current) break;

        const batch = batches[batchIdx];
        setBatchProgress(prev => ({ ...prev, currentBatch: batchIdx + 1 }));

        const result = await scrapeMutation.mutateAsync({ asins: batch, marketplace });
        const batchProducts = result.products as ProductData[];
        allResults.push(...batchProducts);
        totalSuccess += result.success;
        totalFailed += result.failed;

        setProducts([...allResults]);
        setBatchProgress(prev => ({ ...prev, completed: prev.completed + batch.length }));
      }

      if (!abortRef.current) {
        if (totalSuccess > 0) {
          toast.success(`采集完成`, {
            description: `成功 ${totalSuccess} 个，失败 ${totalFailed} 个，共 ${allResults.length} 条`,
          });
        } else {
          toast.warning("采集完成但无成功结果", {
            description: "所有ASIN采集均失败，请检查ASIN是否正确或稍后重试",
          });
        }
      }
    } catch (error: any) {
      toast.error("采集失败", { description: error.message || "请稍后重试" });
    } finally {
      setIsLoading(false);
      setBatchProgress({ completed: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    }
  }, [validAsins, marketplace, scrapeMutation]);

  const handleExportExcel = useCallback(() => {
    if (products.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "ASIN", "站点", "标题", "品牌", "价格", "评分", "评论数",
      "可用性", "五点描述", "产品描述", "主图链接", "所有图片链接",
      "产品规格", "产品详情", "分类路径", "大类", "大类排名", "小类", "小类排名",
      "卖家", "Customers say", "状态", "链接"
    ];

    const rows = products.map(p => {
      const bsr = p.bestSellerRank;
      const cr = p.customerReviews;
      return [
        p.asin,
        p.marketplace,
        p.title || "",
        p.brand || "",
        p.price || "",
        p.rating || "",
        p.reviewCount || "",
        p.availability || "",
        (p.bulletPoints || []).join(" | "),
        p.description || "",
        p.mainImage || "",
        (p.images || []).join(" | "),
        Object.entries(p.specifications || {}).map(([k, v]) => `${k}: ${v}`).join(" | "),
        Object.entries(p.productDetails || {}).map(([k, v]) => `${k}: ${v}`).join(" | "),
        p.categories || "",
        bsr?.mainCategory || "",
        bsr?.mainRank != null ? String(bsr.mainRank) : "",
        bsr?.subCategory || "",
        bsr?.subRank != null ? String(bsr.subRank) : "",
        p.seller || "",
        cr?.customersSay || "",
        p.status === "success" ? "成功" : "失败",
        p.url,
      ];
    });

    const BOM = "\uFEFF";
    const csvContent = BOM + [
      headers.map(h => `"${h}"`).join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `amazon_products_${marketplace}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("导出成功", { description: `已导出 ${products.length} 条数据，CSV文件可用Excel打开` });
  }, [products, marketplace]);

  const handleClear = useCallback(() => {
    setProducts([]);
    setAsinInput("");
    setCurrentPage(1);
  }, []);

  const handleResetSession = useCallback(async () => {
    try {
      await resetSessionMutation.mutateAsync({ marketplace });
      toast.success("会话已重置", { description: "浏览器指纹和Cookie已刷新，可以重新采集" });
    } catch {
      toast.error("重置失败");
    }
  }, [marketplace, resetSessionMutation]);

  const handleRetryFailed = useCallback(async () => {
    const failedAsins = products.filter(p => p.status === "failed").map(p => p.asin);
    if (failedAsins.length === 0) return;

    try { await resetSessionMutation.mutateAsync({ marketplace }); } catch {}

    setIsLoading(true);
    abortRef.current = false;

    const batches: string[][] = [];
    for (let i = 0; i < failedAsins.length; i += BATCH_SIZE) {
      batches.push(failedAsins.slice(i, i + BATCH_SIZE));
    }

    setBatchProgress({ completed: 0, total: failedAsins.length, currentBatch: 0, totalBatches: batches.length });

    let totalSuccess = 0;

    try {
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        if (abortRef.current) break;
        const batch = batches[batchIdx];
        setBatchProgress(prev => ({ ...prev, currentBatch: batchIdx + 1 }));

        const result = await scrapeMutation.mutateAsync({ asins: batch, marketplace });
        totalSuccess += result.success;

        setProducts(prev => {
          const updated = [...prev];
          for (const newProduct of result.products as ProductData[]) {
            const idx = updated.findIndex(p => p.asin === newProduct.asin);
            if (idx >= 0) updated[idx] = newProduct;
            else updated.push(newProduct);
          }
          return updated;
        });

        setBatchProgress(prev => ({ ...prev, completed: prev.completed + batch.length }));
      }

      toast.success(`重试完成`, { description: `${totalSuccess}/${failedAsins.length} 个重试成功` });
    } catch (error: any) {
      toast.error("重试失败", { description: error.message });
    } finally {
      setIsLoading(false);
      setBatchProgress({ completed: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    }
  }, [products, marketplace, scrapeMutation, resetSessionMutation]);

  const successCount = products.filter(p => p.status === "success").length;
  const failedCount = products.filter(p => p.status === "failed").length;

  const progressPercent = batchProgress.total > 0
    ? Math.round((batchProgress.completed / batchProgress.total) * 100)
    : 0;

  const currentMarketplaceName = marketplaces?.find(m => m.code === marketplace)?.name || marketplace;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amazon/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-amazon" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Amazon Scraper</h1>
              <p className="text-xs text-muted-foreground">亚马逊产品信息批量采集</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <Link href="/history">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                  <History className="w-4 h-4" />
                  采集历史
                </Button>
              </Link>
            )}
            {isAuthenticated && user ? (
              <Badge variant="secondary" className="gap-1.5 py-1 px-3">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                {user.name || "已登录"}
              </Badge>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/login")}>
                <LogIn className="w-3.5 h-3.5" />
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel - Input */}
          <div className="lg:col-span-3 space-y-5">
            {/* Marketplace Selector */}
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amazon" />
                  选择亚马逊站点
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={marketplace} onValueChange={setMarketplace}>
                  <SelectTrigger className="bg-input/50 border-border/50 h-11">
                    <SelectValue placeholder="选择站点" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border max-h-80">
                    {marketplaces?.map(mp => (
                      <SelectItem key={mp.code} value={mp.code}>
                        <span className="flex items-center gap-2">
                          <span>{mp.flag}</span>
                          <span>{mp.name}</span>
                          <span className="text-muted-foreground text-xs">({mp.domain})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* ASIN Input - fixed height with scroll */}
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4 text-amazon" />
                  输入ASIN
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Fixed-height scrollable textarea */}
                <div className="relative">
                  <Textarea
                    value={asinInput}
                    onChange={e => setAsinInput(e.target.value)}
                    placeholder={"输入ASIN，每行一个或用逗号分隔\n例如:\nB0XXXXXXXXX\nB0YYYYYYYYY\nB0ZZZZZZZZZ"}
                    className="h-[220px] max-h-[220px] overflow-y-auto bg-input/50 border-border/50 resize-none font-mono text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    已输入 <span className="text-foreground font-medium">{asins.length}</span> 个，
                    有效 <span className="text-success font-medium">{validAsins.length}</span> 个
                  </span>
                  {asins.length > validAsins.length && (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {asins.length - validAsins.length} 个无效
                    </span>
                  )}
                </div>

                {/* Batch progress bar */}
                {isLoading && batchProgress.total > 0 && (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-amazon" />
                        第 {batchProgress.currentBatch}/{batchProgress.totalBatches} 批
                      </span>
                      <span className="font-medium text-amazon">
                        {batchProgress.completed}/{batchProgress.total} ({progressPercent}%)
                      </span>
                    </div>
                    <Progress value={progressPercent} className="h-1.5" />
                    <p className="text-xs text-muted-foreground/70">
                      每批 {BATCH_SIZE} 个处理，正在访问 {currentMarketplaceName} 站点
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleScrape}
                    disabled={isLoading || validAsins.length === 0}
                    className="flex-1 bg-amazon hover:bg-amazon-dark text-primary-foreground font-semibold h-11 gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        采集中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        开始采集
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                  {products.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleClear}
                          className="h-11 w-11 shrink-0"
                          disabled={isLoading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>清除结果</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="bg-card/50 border-border/30">
              <CardContent className="pt-5">
                <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">使用说明</h4>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-amazon">1.</span>
                    选择目标亚马逊站点（支持20+站点）
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amazon">2.</span>
                    输入ASIN，支持批量输入（每行一个或逗号分隔，数量不限）
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amazon">3.</span>
                    点击"开始采集"，系统将分批访问产品页面并实时展示进度
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amazon">4.</span>
                    采集完成后可查看详情或导出为CSV/Excel
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amazon mt-0.5">
                      <Shield className="w-3 h-3" />
                    </span>
                    系统自动模拟真实浏览器行为，含智能重试
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amazon mt-0.5">
                      <Package className="w-3 h-3" />
                    </span>
                    每批 {BATCH_SIZE} 个处理，大批量时建议分时段采集
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-9">
            <Card className="bg-card border-border/50 flex flex-col" style={{ height: "calc(100vh - 120px)", minHeight: "600px", width: "100%" }}>
              <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4 text-amazon" />
                    采集结果
                    {products.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {products.length} 条
                      </Badge>
                    )}
                  </CardTitle>
                  {products.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          成功 {successCount}
                        </span>
                        {failedCount > 0 && (
                          <span className="flex items-center gap-1 text-destructive">
                            <XCircle className="w-3.5 h-3.5" />
                            失败 {failedCount}
                          </span>
                        )}
                      </div>
                      {failedCount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRetryFailed}
                          disabled={isLoading}
                          className="gap-1.5 h-8 text-amazon border-amazon/30 hover:bg-amazon/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              重试中...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              重试失败
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetSession}
                        disabled={isLoading}
                        className="gap-1.5 h-8"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        刷新会话
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportExcel}
                        className="gap-1.5 h-8"
                      >
                        <Download className="w-3.5 h-3.5" />
                        导出CSV
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <Separator className="shrink-0" />

              {/* Table area - scrollable */}
              <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
                {/* Loading state - initial (no products yet) */}
                {isLoading && products.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-amazon" />
                    <div className="text-center">
                      <p className="text-sm font-medium">正在采集产品数据...</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        正在访问亚马逊 {currentMarketplaceName} 站点，共 {validAsins.length} 个ASIN
                      </p>
                    </div>
                    {batchProgress.total > 0 && (
                      <div className="w-64 space-y-1.5">
                        <Progress value={progressPercent} className="h-1.5" />
                        <p className="text-xs text-center text-muted-foreground">
                          第 {batchProgress.currentBatch}/{batchProgress.totalBatches} 批 · {batchProgress.completed}/{batchProgress.total}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!isLoading && products.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center p-16 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                      <Search className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">暂无采集结果</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        输入ASIN并点击"开始采集"获取产品数据
                      </p>
                    </div>
                  </div>
                )}

                {/* Results table */}
                {products.length > 0 && (
                  <>
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-card z-10 shadow-sm">
                          <tr className="border-b border-border/50">
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider w-8">#</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider w-14">图片</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">ASIN</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider min-w-[220px]">标题</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">品牌</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">价格</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">评分</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider min-w-[120px]">
                              <span className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                分类路径
                              </span>
                            </th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">大类</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">大类排名</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">小类</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">小类排名</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">状态</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider w-20">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedProducts.map((product, index) => {
                            const globalIndex = (currentPage - 1) * pageSize + index;
                            const bsr = product.bestSellerRank;
                            // Truncate categories path
                            const catPath = product.categories;
                            const catTruncated = catPath && catPath.length > 40
                              ? catPath.slice(0, 40) + "…"
                              : catPath;
                            return (
                              <tr
                                key={product.asin + globalIndex}
                                className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                              >
                                <td className="px-3 py-3 text-muted-foreground text-xs">{globalIndex + 1}</td>
                                <td className="px-3 py-3">
                                  {product.mainImage ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <img
                                          src={product.mainImage}
                                          alt=""
                                          className="w-16 h-16 object-contain rounded bg-white p-0.5 cursor-pointer hover:scale-110 transition-transform"
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent className="p-0 border-0 bg-transparent">
                                        <img
                                          src={product.mainImage}
                                          alt=""
                                          className="w-32 h-32 object-contain rounded bg-white p-1"
                                        />
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <div className="w-16 h-16 rounded bg-muted/30 flex items-center justify-center">
                                      <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                                    {product.asin}
                                  </code>
                                </td>
                                <td className="px-3 py-3">
                                  {product.title ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <p className="text-sm line-clamp-2 max-w-[220px] leading-snug cursor-help">
                                          {product.title}
                                        </p>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-sm text-xs">{product.title}</TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span className="text-muted-foreground italic text-sm">无标题</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                  {product.brand || "-"}
                                </td>
                                <td className="px-3 py-3">
                                  {product.price ? (
                                    <span className="text-amazon font-semibold text-xs whitespace-nowrap">{product.price}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs">
                                  {product.rating ? (
                                    <span className="flex items-center gap-1 whitespace-nowrap">
                                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                      {product.rating.replace(/ out of.*/i, "")}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                {/* Category path - truncated */}
                                <td className="px-3 py-3 text-xs text-muted-foreground max-w-[160px]">
                                  {catTruncated ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default line-clamp-2">{catTruncated}</span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">{catPath}</TooltipContent>
                                    </Tooltip>
                                  ) : "-"}
                                </td>
                                {/* Main category */}
                                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[120px]">
                                  <span className="line-clamp-1">{bsr?.mainCategory || "-"}</span>
                                </td>
                                {/* Main rank */}
                                <td className="px-3 py-3 text-xs whitespace-nowrap">
                                  {bsr?.mainRank != null ? (
                                    <span className="font-semibold text-amazon">#{bsr.mainRank.toLocaleString()}</span>
                                  ) : "-"}
                                </td>
                                {/* Sub category */}
                                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[120px]">
                                  <span className="line-clamp-1">{bsr?.subCategory || "-"}</span>
                                </td>
                                {/* Sub rank */}
                                <td className="px-3 py-3 text-xs whitespace-nowrap">
                                  {bsr?.subRank != null ? (
                                    <span className="font-semibold text-amazon">#{bsr.subRank.toLocaleString()}</span>
                                  ) : "-"}
                                </td>
                                <td className="px-3 py-3">
                                  {product.status === "success" ? (
                                    <Badge variant="secondary" className="text-success bg-success/10 text-xs gap-1 whitespace-nowrap">
                                      <CheckCircle2 className="w-3 h-3" />
                                      成功
                                    </Badge>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="secondary" className="text-destructive bg-destructive/10 text-xs gap-1 whitespace-nowrap">
                                          <XCircle className="w-3 h-3" />
                                          失败
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        {product.errorMessage || "未知错误"}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            setSelectedProduct(product);
                                            setDetailOpen(true);
                                          }}
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>查看详情</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a href={product.url} target="_blank" rel="noopener noreferrer">
                                          <Button variant="ghost" size="icon" className="h-7 w-7">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </Button>
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>在亚马逊查看</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Loading indicator at bottom of table */}
                      {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground border-t border-border/30">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amazon" />
                          正在采集第 {batchProgress.currentBatch}/{batchProgress.totalBatches} 批...
                          <span className="text-amazon font-medium">{batchProgress.completed}/{batchProgress.total}</span>
                        </div>
                      )}
                    </div>

                    {/* Pagination footer */}
                    <div className="shrink-0 border-t border-border/50 px-4 py-3 flex items-center justify-between gap-4 bg-card/50">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>每页</span>
                        {PAGE_SIZE_OPTIONS.map(size => (
                          <button
                            key={size}
                            onClick={() => handlePageSizeChange(size)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                              pageSize === size
                                ? "bg-amazon text-primary-foreground"
                                : "hover:bg-muted text-muted-foreground"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                        <span>条</span>
                        <span className="ml-2 text-foreground/60">
                          共 <span className="text-foreground font-medium">{products.length}</span> 条
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-2">
                          第 <span className="text-foreground font-medium">{currentPage}</span> / {totalPages} 页
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                          <ChevronsRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Product Detail Dialog */}
      <ProductDetailDialog
        product={selectedProduct}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
