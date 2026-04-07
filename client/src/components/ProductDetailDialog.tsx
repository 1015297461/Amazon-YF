import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ExternalLink,
  Star,
  Package,
  Tag,
  List,
  FileText,
  Image as ImageIcon,
  TrendingUp,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  Download,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export interface ProductData {
  asin: string;
  marketplace: string;
  url: string;
  title: string | null;
  brand: string | null;
  price: string | null;
  rating: string | null;
  reviewCount: string | null;
  availability: string | null;
  bulletPoints: string[];
  description: string | null;
  mainImage: string | null;
  images: string[];
  aplusImages?: string[];
  specifications: Record<string, string>;
  productDetails: Record<string, string>;
  categories: string | null;
  seller: string | null;
  bestSellerRank?: {
    mainCategory: string | null;
    mainRank: number | null;
    subCategory: string | null;
    subRank: number | null;
    rawText: string | null;
  };
  customerReviews?: {
    customersSay: string | null;
    reviewImages: string[];
    selectToLearnMore: string[];
  };
  status: "success" | "failed";
  errorMessage?: string | null;
}

interface Props {
  product: ProductData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Convert Amazon thumbnail URL to high-resolution URL.
 */
function toHighRes(url: string): string {
  if (!url) return url;
  return url.replace(/\._[A-Z0-9_,]+_\./i, "._SL1500_.");
}

// ============================================================
// Lightbox component
// ============================================================
interface LightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
  const [current, setCurrent] = useState(initialIndex);

  const prev = useCallback(() => {
    setCurrent(i => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setCurrent(i => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose, prev, next]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        onClick={onClose}
        aria-label="关闭 (ESC)"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/60 text-white text-sm">
        {current + 1} / {images.length}
      </div>

      {images.length > 1 && (
        <button
          className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
          onClick={e => { e.stopPropagation(); prev(); }}
          aria-label="上一张"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      <div
        className="max-w-[85vw] max-h-[85vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        <img
          key={current}
          src={toHighRes(images[current])}
          alt={`Image ${current + 1}`}
          className="max-w-full max-h-[85vh] object-contain select-none"
          draggable={false}
        />
      </div>

      {images.length > 1 && (
        <button
          className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
          onClick={e => { e.stopPropagation(); next(); }}
          aria-label="下一张"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {images.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto py-2 px-3 bg-black/50 rounded-xl"
          onClick={e => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all ${
                i === current ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={toHighRes(img)}
                alt={`Thumb ${i + 1}`}
                className="w-full h-full object-contain bg-white"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Image download helper via server proxy
// ============================================================
async function downloadImagesViaProxy(images: string[], asin: string, category: string) {
  if (images.length === 0) {
    toast.error("没有可导出的图片");
    return;
  }
  toast.info(`开始下载 ${images.length} 张${category}...`);
  let success = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(toHighRes(img))}`);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${asin}_${category}_${i + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success++;
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 400));
    } catch {
      console.warn("Failed to download image:", img);
    }
  }
  if (success > 0) {
    toast.success(`已下载 ${success} 张${category}`);
  } else {
    toast.error("图片下载失败，请检查网络连接");
  }
}

// ============================================================
// Keys to filter from productDetails / specifications
// (these values are already shown separately in the UI)
// ============================================================
const REVIEW_RELATED_KEYS = /customer.?review|number.?of.?review|rating|评分|评论/i;

// ============================================================
// Main ProductDetailDialog
// ============================================================
export default function ProductDetailDialog({ product, open, onOpenChange }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!product) return null;

  const bsr = product.bestSellerRank;
  const cr = product.customerReviews;
  const aplusImages = product.aplusImages ?? [];
  const productImages = [product.mainImage, ...product.images].filter((img): img is string => !!img);
  const reviewImages = (cr?.reviewImages ?? []).filter((img): img is string => !!img);

  // Filter productDetails/specifications to avoid duplicate info
  const filteredProductDetails = Object.fromEntries(
    Object.entries(product.productDetails).filter(([k]) => !REVIEW_RELATED_KEYS.test(k))
  );
  const filteredSpecifications = Object.fromEntries(
    Object.entries(product.specifications).filter(([k]) => !REVIEW_RELATED_KEYS.test(k))
  );

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-card border-border/50 p-0 flex flex-col">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-bold text-foreground leading-snug">
                  {product.title || "未获取标题"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">ASIN: {product.asin}</p>
              </div>
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  查看
                </Button>
              </a>
            </div>
          </DialogHeader>

          {/* Scrollable content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-6 py-4 space-y-6">

              {/* ── 产品图片 ── */}
              {productImages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-amazon" />
                      产品图片
                      <span className="text-xs text-muted-foreground font-normal">({productImages.length} 张)</span>
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => downloadImagesViaProxy(productImages, product.asin, "产品图片")}
                    >
                      <Download className="w-3 h-3" />
                      导出
                    </Button>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {productImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="aspect-square rounded-lg overflow-hidden bg-muted border border-border/30 cursor-pointer hover:border-amazon/50 transition-all group relative"
                        onClick={() => openLightbox(productImages, idx)}
                      >
                        <img
                          src={img}
                          alt={`Product ${idx + 1}`}
                          className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                          <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 基本信息 ── */}
              <div className="grid grid-cols-2 gap-4">
                {product.brand && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">品牌</p>
                    <p className="text-sm font-medium">{product.brand}</p>
                  </div>
                )}
                {product.price && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">价格</p>
                    <p className="text-sm font-medium text-amazon">{product.price}</p>
                  </div>
                )}
                {product.rating && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">评分</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{product.rating}</span>
                      <Star className="w-4 h-4 fill-amazon text-amazon" />
                      {product.reviewCount && (
                        <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
                      )}
                    </div>
                  </div>
                )}
                {!product.rating && product.reviewCount && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">评论数</p>
                    <p className="text-sm font-medium">{product.reviewCount}</p>
                  </div>
                )}
                {product.availability && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">库存状态</p>
                    <p className="text-sm font-medium">{product.availability}</p>
                  </div>
                )}
                {product.seller && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">卖家</p>
                    <p className="text-sm font-medium">{product.seller}</p>
                  </div>
                )}
              </div>

              {/* ── 销售排名 ── */}
              {(bsr?.mainCategory || bsr?.subCategory) && (
                <>
                  <Separator className="bg-border/30" />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amazon" />
                      销售排名
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {bsr?.mainCategory && (
                        <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-1">大类</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm font-medium truncate cursor-help">{bsr.mainCategory}</p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{bsr.mainCategory}</TooltipContent>
                          </Tooltip>
                          {bsr.mainRank && (
                            <p className="text-xs text-amazon mt-1">排名: #{bsr.mainRank.toLocaleString()}</p>
                          )}
                        </div>
                      )}
                      {bsr?.subCategory && (
                        <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-1">小类</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm font-medium truncate cursor-help">{bsr.subCategory}</p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{bsr.subCategory}</TooltipContent>
                          </Tooltip>
                          {bsr.subRank && (
                            <p className="text-xs text-amazon mt-1">排名: #{bsr.subRank.toLocaleString()}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── 五点描述 ── */}
              {product.bulletPoints.length > 0 && (
                <>
                  <Separator className="bg-border/30" />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <List className="w-4 h-4 text-amazon" />
                      五点描述
                    </h3>
                    <ul className="space-y-2">
                      {product.bulletPoints.map((point, i) => (
                        <li key={i} className="text-sm text-foreground/90 flex gap-3">
                          <span className="text-amazon font-semibold shrink-0">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* ── 产品描述 ── */}
              {product.description && (
                <>
                  <Separator className="bg-border/30" />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amazon" />
                      产品描述
                    </h3>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {product.description}
                    </p>
                  </div>
                </>
              )}

              {/* ── A+ 内容图片 ── */}
              <>
                <Separator className="bg-border/30" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amazon" />
                      A+ 内容图片
                      {aplusImages.length > 0 && (
                        <span className="text-xs text-muted-foreground font-normal">({aplusImages.length} 张)</span>
                      )}
                    </h3>
                    {aplusImages.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => downloadImagesViaProxy(aplusImages, product.asin, "A+图片")}
                      >
                        <Download className="w-3 h-3" />
                        导出
                      </Button>
                    )}
                  </div>
                  {aplusImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {aplusImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg overflow-hidden bg-muted border border-border/30 cursor-pointer hover:border-amazon/50 transition-all group relative"
                          onClick={() => openLightbox(aplusImages, idx)}
                        >
                          <img
                            src={img}
                            alt={`A+ ${idx + 1}`}
                            className="w-full object-contain group-hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                            <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">该商品暂无 A+ 内容图片</p>
                  )}
                </div>
              </>

              {/* ── 顾客评价 ── */}
              <>
                <Separator className="bg-border/30" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-amazon" />
                      顾客评价
                    </h3>
                    {reviewImages.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => downloadImagesViaProxy(reviewImages, product.asin, "评论图片")}
                      >
                        <Download className="w-3 h-3" />
                        导出图片
                      </Button>
                    )}
                  </div>

                  {/* Customers say */}
                  {cr?.customersSay ? (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Customers say</p>
                      <p className="text-sm text-foreground/90 leading-relaxed">{cr.customersSay}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无顾客评价摘要</p>
                  )}

                  {/* Select to learn more */}
                  {cr?.selectToLearnMore && cr.selectToLearnMore.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Select to learn more</p>
                      <div className="flex flex-wrap gap-2">
                        {cr.selectToLearnMore.map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Customer photos and videos */}
                  {reviewImages.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-medium">
                          Customer photos and videos ({reviewImages.length} 张)
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-amazon hover:text-amazon/80 px-2"
                          onClick={() => openLightbox(reviewImages, 0)}
                        >
                          查看全部
                        </Button>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {reviewImages.slice(0, 10).map((img, idx) => (
                          <div
                            key={idx}
                            className="aspect-square rounded-md overflow-hidden bg-muted border border-border/30 cursor-pointer hover:border-amazon/50 transition-all group relative"
                            onClick={() => openLightbox(reviewImages, idx)}
                          >
                            <img
                              src={img}
                              alt={`Review ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                              <ZoomIn className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无顾客图片</p>
                  )}
                </div>
              </>

              {/* ── 产品规格 ── */}
              {Object.keys(filteredSpecifications).length > 0 && (
                <>
                  <Separator className="bg-border/30" />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Tag className="w-4 h-4 text-amazon" />
                      产品规格
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(filteredSpecifications).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-3 gap-4 text-sm border-b border-border/20 pb-2 last:border-0">
                          <span className="text-muted-foreground font-medium">{key}</span>
                          <span className="col-span-2 text-foreground/90">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── 产品详情 ── */}
              {Object.keys(filteredProductDetails).length > 0 && (
                <>
                  <Separator className="bg-border/30" />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="w-4 h-4 text-amazon" />
                      产品详情
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(filteredProductDetails).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-3 gap-4 text-sm border-b border-border/20 pb-2 last:border-0">
                          <span className="text-muted-foreground font-medium">{key}</span>
                          <span className="col-span-2 text-foreground/90">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {lightboxOpen && (
        <Lightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
