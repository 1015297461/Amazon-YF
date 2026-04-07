import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProductDetailDialog, { type ProductData } from "@/components/ProductDetailDialog";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import {
  Package,
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  ExternalLink,
  Download,
  CheckCircle2,
  XCircle,
  Globe,
  Calendar,
  LogIn,
  Star,
  Image as ImageIcon,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";

const PAGE_SIZE_OPTIONS = [30, 60, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// Map DB product row to ProductData shape used by the dialog
function dbProductToProductData(p: any): ProductData {
  return {
    asin: p.asin,
    marketplace: p.marketplace,
    url: `https://www.amazon.com/dp/${p.asin}`,
    title: p.title,
    brand: p.brand,
    price: p.price,
    rating: p.rating,
    reviewCount: p.reviewCount,
    availability: p.availability,
    bulletPoints: Array.isArray(p.bulletPoints) ? p.bulletPoints : [],
    description: p.description,
    mainImage: p.mainImage,
    images: Array.isArray(p.images) ? p.images : [],
    aplusImages: Array.isArray(p.aplusImages) ? p.aplusImages : [],
    specifications: (p.specifications && typeof p.specifications === "object") ? p.specifications : {},
    productDetails: (p.productDetails && typeof p.productDetails === "object") ? p.productDetails : {},
    categories: p.categories,
    seller: p.seller,
    bestSellerRank: {
      mainCategory: p.bsrMainCategory ?? null,
      mainRank: p.bsrMainRank ?? null,
      subCategory: p.bsrSubCategory ?? null,
      subRank: p.bsrSubRank ?? null,
      rawText: p.bsrRawText ?? null,
    },
    customerReviews: {
      customersSay: p.customersSay ?? null,
      reviewImages: Array.isArray(p.reviewImages) ? p.reviewImages : [],
      selectToLearnMore: Array.isArray(p.selectToLearnMore) ? p.selectToLearnMore : [],
    },
    status: p.status,
    errorMessage: p.errorMessage,
  };
}

export default function History() {
  const { user, isAuthenticated, loading } = useAuth();

  // Task list pagination
  const [taskPage, setTaskPage] = useState(1);
  const taskPageSize = 20;

  // Selected task for detail view
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // Product pagination within a task
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState<PageSize>(30);

  // Product detail dialog
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Fetch task history list
  const { data: historyData, isLoading: historyLoading } = trpc.scraper.getHistory.useQuery(
    { page: taskPage, pageSize: taskPageSize },
    { enabled: isAuthenticated }
  );

  // Fetch products for selected task
  const { data: productsData, isLoading: productsLoading } = trpc.scraper.getHistoryProducts.useQuery(
    { taskId: selectedTaskId!, page: productPage, pageSize: productPageSize },
    { enabled: selectedTaskId != null && isAuthenticated }
  );

  const tasks = historyData?.tasks ?? [];
  const totalTasks = historyData?.total ?? 0;
  const totalTaskPages = Math.max(1, Math.ceil(totalTasks / taskPageSize));

  const dbProducts = productsData?.products ?? [];
  const totalProducts = productsData?.total ?? 0;
  const totalProductPages = Math.max(1, Math.ceil(totalProducts / productPageSize));

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  const handleExportTask = useCallback(() => {
    if (dbProducts.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "ASIN", "站点", "标题", "品牌", "价格", "评分", "评论数",
      "可用性", "五点描述", "产品描述", "主图链接", "所有图片链接",
      "产品规格", "产品详情", "分类路径", "大类", "大类排名", "小类", "小类排名",
      "卖家", "Customers say", "状态", "采集时间"
    ];

    const rows = dbProducts.map((p: any) => [
      p.asin,
      p.marketplace,
      p.title || "",
      p.brand || "",
      p.price || "",
      p.rating || "",
      p.reviewCount || "",
      p.availability || "",
      (Array.isArray(p.bulletPoints) ? p.bulletPoints : []).join(" | "),
      p.description || "",
      p.mainImage || "",
      (Array.isArray(p.images) ? p.images : []).join(" | "),
      Object.entries(p.specifications || {}).map(([k, v]) => `${k}: ${v}`).join(" | "),
      Object.entries(p.productDetails || {}).map(([k, v]) => `${k}: ${v}`).join(" | "),
      p.categories || "",
      p.bsrMainCategory || "",
      p.bsrMainRank != null ? String(p.bsrMainRank) : "",
      p.bsrSubCategory || "",
      p.bsrSubRank != null ? String(p.bsrSubRank) : "",
      p.seller || "",
      p.customersSay || "",
      p.status === "success" ? "成功" : "失败",
      p.scrapedAt ? new Date(p.scrapedAt).toLocaleString() : "",
    ]);

    const BOM = "\uFEFF";
    const csvContent = BOM + [
      headers.map(h => `"${h}"`).join(","),
      ...rows.map((row: string[]) => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `history_task_${selectedTaskId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("导出成功", { description: `已导出 ${dbProducts.length} 条数据` });
  }, [dbProducts, selectedTaskId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Package className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">请登录后查看采集历史</p>
        <a href={getLoginUrl()}>
          <Button className="gap-1.5">
            <LogIn className="w-4 h-4" />
            登录
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-9 h-9 rounded-lg bg-amazon/10 flex items-center justify-center">
              <HistoryIcon className="w-5 h-5 text-amazon" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">采集历史</h1>
              <p className="text-xs text-muted-foreground">查看历史采集任务和产品数据</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1.5 py-1 px-3">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              {user?.name || "已登录"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Task list */}
          <div className="lg:col-span-3">
            <Card className="bg-card border-border/50 flex flex-col" style={{ height: "calc(100vh - 120px)", minHeight: "500px" }}>
              <CardHeader className="pb-3 shrink-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HistoryIcon className="w-4 h-4 text-amazon" />
                  任务列表
                  {totalTasks > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">{totalTasks} 个</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <Separator className="shrink-0" />
              <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
                {historyLoading ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">加载中...</div>
                ) : tasks.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                    <HistoryIcon className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">暂无采集历史</p>
                    <Link href="/">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        去采集
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-auto">
                      {tasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => {
                            setSelectedTaskId(task.id);
                            setProductPage(1);
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-border/30 transition-colors hover:bg-muted/20 ${
                            selectedTaskId === task.id ? "bg-amazon/5 border-l-2 border-l-amazon" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Globe className="w-3.5 h-3.5 text-amazon shrink-0" />
                                <span className="text-sm font-medium">{task.marketplace}</span>
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ml-auto ${
                                    task.status === "completed"
                                      ? "text-success bg-success/10"
                                      : task.status === "running"
                                      ? "text-amazon bg-amazon/10"
                                      : "text-destructive bg-destructive/10"
                                  }`}
                                >
                                  {task.status === "completed" ? "已完成" : task.status === "running" ? "进行中" : "失败"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-success" />
                                  {task.completedAsins}
                                </span>
                                {(task.failedAsins ?? 0) > 0 && (
                                  <span className="flex items-center gap-1">
                                    <XCircle className="w-3 h-3 text-destructive" />
                                    {task.failedAsins}
                                  </span>
                                )}
                                <span>共 {task.totalAsins} 个</span>
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/60">
                                <Calendar className="w-3 h-3" />
                                {new Date(task.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Task pagination */}
                    {totalTaskPages > 1 && (
                      <div className="shrink-0 border-t border-border/50 px-4 py-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">第 {taskPage}/{totalTaskPages} 页</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTaskPage(1)} disabled={taskPage === 1}>
                            <ChevronsLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTaskPage(p => Math.max(1, p - 1))} disabled={taskPage === 1}>
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTaskPage(p => Math.min(totalTaskPages, p + 1))} disabled={taskPage === totalTaskPages}>
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTaskPage(totalTaskPages)} disabled={taskPage === totalTaskPages}>
                            <ChevronsRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Products for selected task */}
          <div className="lg:col-span-9">
            <Card className="bg-card border-border/50 flex flex-col" style={{ height: "calc(100vh - 120px)", minHeight: "500px" }}>
              <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4 text-amazon" />
                    {selectedTaskId
                      ? `任务 #${selectedTaskId} 的产品数据`
                      : "请选择左侧任务查看详情"}
                    {totalProducts > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">{totalProducts} 条</Badge>
                    )}
                  </CardTitle>
                  {dbProducts.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleExportTask} className="gap-1.5 h-8">
                      <Download className="w-3.5 h-3.5" />
                      导出CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <Separator className="shrink-0" />
              <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
                {!selectedTaskId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                    <Package className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">点击左侧任务查看产品数据</p>
                  </div>
                ) : productsLoading ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">加载中...</div>
                ) : dbProducts.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">该任务暂无产品数据</div>
                ) : (
                  <>
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card z-10 shadow-sm">
                          <tr className="border-b border-border/50">
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider w-8">#</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider w-14">图片</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">ASIN</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider min-w-[160px]">标题</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">品牌</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">价格</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">评分</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider min-w-[100px]">
                              <span className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                分类路径
                              </span>
                            </th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">大类排名</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">小类排名</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">状态</th>
                            <th className="text-left px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider w-20">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dbProducts.map((p: any, index: number) => {
                            const globalIndex = (productPage - 1) * productPageSize + index;
                            const catPath = p.categories;
                            const catTruncated = catPath && catPath.length > 35
                              ? catPath.slice(0, 35) + "…"
                              : catPath;
                            return (
                              <tr
                                key={p.id}
                                className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                              >
                                <td className="px-3 py-3 text-muted-foreground text-xs">{globalIndex + 1}</td>
                                <td className="px-3 py-3">
                                  {p.mainImage ? (
                                    <img src={p.mainImage} alt="" className="w-16 h-16 object-contain rounded bg-white p-0.5" />
                                  ) : (
                                    <div className="w-16 h-16 rounded bg-muted/30 flex items-center justify-center">
                                      <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">{p.asin}</code>
                                </td>
                                <td className="px-3 py-3">
                                  <p className="text-sm line-clamp-2 max-w-[160px] leading-snug">
                                    {p.title || <span className="text-muted-foreground italic">无标题</span>}
                                  </p>
                                </td>
                                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{p.brand || "-"}</td>
                                <td className="px-3 py-3">
                                  {p.price ? (
                                    <span className="text-amazon font-semibold text-xs whitespace-nowrap">{p.price}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs">
                                  {p.rating ? (
                                    <span className="flex items-center gap-1 whitespace-nowrap">
                                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                      {String(p.rating).replace(/ out of.*/i, "")}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-muted-foreground max-w-[120px]">
                                  {catTruncated ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default line-clamp-2">{catTruncated}</span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">{catPath}</TooltipContent>
                                    </Tooltip>
                                  ) : "-"}
                                </td>
                                <td className="px-3 py-3 text-xs whitespace-nowrap">
                                  {p.bsrMainRank != null ? (
                                    <span className="font-semibold text-amazon">#{Number(p.bsrMainRank).toLocaleString()}</span>
                                  ) : "-"}
                                </td>
                                <td className="px-3 py-3 text-xs whitespace-nowrap">
                                  {p.bsrSubRank != null ? (
                                    <span className="font-semibold text-amazon">#{Number(p.bsrSubRank).toLocaleString()}</span>
                                  ) : "-"}
                                </td>
                                <td className="px-3 py-3">
                                  {p.status === "success" ? (
                                    <Badge variant="secondary" className="text-success bg-success/10 text-xs gap-1 whitespace-nowrap">
                                      <CheckCircle2 className="w-3 h-3" />成功
                                    </Badge>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="secondary" className="text-destructive bg-destructive/10 text-xs gap-1 whitespace-nowrap">
                                          <XCircle className="w-3 h-3" />失败
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">{p.errorMessage || "未知错误"}</TooltipContent>
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
                                            setSelectedProduct(dbProductToProductData(p));
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
                                        <a href={`https://www.amazon.com/dp/${p.asin}`} target="_blank" rel="noopener noreferrer">
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
                    </div>

                    {/* Product pagination footer */}
                    <div className="shrink-0 border-t border-border/50 px-4 py-3 flex items-center justify-between gap-4 bg-card/50">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>每页</span>
                        {PAGE_SIZE_OPTIONS.map(size => (
                          <button
                            key={size}
                            onClick={() => { setProductPageSize(size); setProductPage(1); }}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                              productPageSize === size
                                ? "bg-amazon text-primary-foreground"
                                : "hover:bg-muted text-muted-foreground"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                        <span>条</span>
                        <span className="ml-2 text-foreground/60">
                          共 <span className="text-foreground font-medium">{totalProducts}</span> 条
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProductPage(1)} disabled={productPage === 1}>
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProductPage(p => Math.max(1, p - 1))} disabled={productPage === 1}>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-2">
                          第 <span className="text-foreground font-medium">{productPage}</span> / {totalProductPages} 页
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProductPage(p => Math.min(totalProductPages, p + 1))} disabled={productPage === totalProductPages}>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProductPage(totalProductPages)} disabled={productPage === totalProductPages}>
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
