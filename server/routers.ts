import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { scrapeProducts, MARKETPLACES, resetSession } from "./scraper";
import { sdk } from "./_core/sdk";
import { verifyPassword } from "./_core/localAuth";
import {
  createScrapeTask,
  updateScrapeTask,
  getUserTasks,
  insertProducts,
  getTaskProducts,
  getUserTaskHistory,
  getTaskProductsPaginated,
  getTaskById,
  getUserByUsername,
  createUserWithPassword,
  updateUserPassword,
  countUsers,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(z.object({
        username: z.string().min(1, "用户名不能为空"),
        password: z.string().min(1, "密码不能为空"),
      }))
      .mutation(async ({ ctx, input }) => {
        let user;
        try {
          user = await getUserByUsername(input.username);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "登录服务暂时不可用，请稍后重试" });
        }
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
        }
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
        }
        const token = await sdk.createSessionToken(user.openId, { name: user.name || user.username || "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        // Update lastSignedIn
        await import("./db").then(db => db.upsertUser({ openId: user.openId, lastSignedIn: new Date() }));
        return { success: true, user: { id: user.id, name: user.name, username: user.username, role: user.role } };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Create a new user (admin only)
    createUser: protectedProcedure
      .input(z.object({
        username: z.string().min(2, "用户名至少2位").max(32, "用户名最多32位").regex(/^[a-zA-Z0-9_]+$/, "只能包含字母、数字、下划线"),
        password: z.string().min(6, "密码至少6位"),
        name: z.string().optional(),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可创建用户" });
        }
        await createUserWithPassword({ ...input, name: input.name || input.username });
        return { success: true };
      }),

    // Change own password
    changePassword: protectedProcedure
      .input(z.object({
        oldPassword: z.string().min(1),
        newPassword: z.string().min(6, "新密码至少6位"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "当前账户不支持修改密码" });
        }
        const valid = await verifyPassword(input.oldPassword, ctx.user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "原密码错误" });
        }
        await updateUserPassword(ctx.user.id, input.newPassword);
        return { success: true };
      }),
  }),

  scraper: router({
    // Get available marketplaces
    getMarketplaces: publicProcedure.query(() => {
      return Object.entries(MARKETPLACES).map(([code, info]) => ({
        code,
        ...info,
      }));
    }),

    // Scrape products by ASINs (no upper limit - handled in batches server-side)
    scrape: protectedProcedure
      .input(
        z.object({
          asins: z.array(z.string().min(1)).min(1),
          marketplace: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { asins, marketplace } = input;

        if (!MARKETPLACES[marketplace]) {
          throw new Error(`不支持的站点: ${marketplace}`);
        }

        // Clean ASINs
        const cleanAsins = asins
          .map(a => a.trim().toUpperCase())
          .filter(a => /^[A-Z0-9]{10}$/.test(a));

        if (cleanAsins.length === 0) {
          throw new Error("没有有效的ASIN，ASIN应为10位字母数字组合");
        }

        // Create task record
        const taskId = await createScrapeTask({
          userId: ctx.user.id,
          marketplace,
          totalAsins: cleanAsins.length,
          completedAsins: 0,
          failedAsins: 0,
          status: "running",
        });

        // Scrape products
        const results = await scrapeProducts(cleanAsins, marketplace);

        // Save results to database (including new BSR + customer review fields)
        const productRecords = results.map(p => ({
          taskId,
          userId: ctx.user.id,
          asin: p.asin,
          marketplace: p.marketplace,
          title: p.title,
          brand: p.brand,
          price: p.price,
          rating: p.rating,
          reviewCount: p.reviewCount,
          availability: p.availability,
          bulletPoints: p.bulletPoints,
          description: p.description,
          mainImage: p.mainImage,
          images: p.images,
          aplusImages: p.aplusImages,
          specifications: p.specifications,
          productDetails: p.productDetails,
          categories: p.categories,
          seller: p.seller,
          // BSR fields
          bsrMainCategory: p.bestSellerRank.mainCategory,
          bsrMainRank: p.bestSellerRank.mainRank,
          bsrSubCategory: p.bestSellerRank.subCategory,
          bsrSubRank: p.bestSellerRank.subRank,
          bsrRawText: p.bestSellerRank.rawText,
          // Customer review fields
          customersSay: p.customerReviews.customersSay,
          reviewImages: p.customerReviews.reviewImages,
          selectToLearnMore: p.customerReviews.selectToLearnMore,
          status: p.status as "success" | "failed",
          errorMessage: p.errorMessage,
        }));

        await insertProducts(productRecords);

        // Update task status
        const successCount = results.filter(r => r.status === "success").length;
        const failedCount = results.filter(r => r.status === "failed").length;

        await updateScrapeTask(taskId, {
          completedAsins: successCount,
          failedAsins: failedCount,
          status: "completed",
        });

        return {
          taskId,
          total: cleanAsins.length,
          success: successCount,
          failed: failedCount,
          products: results,
        };
      }),

    // Quick scrape without saving to DB (public, for quick testing - no limit)
    quickScrape: publicProcedure
      .input(
        z.object({
          asins: z.array(z.string().min(1)).min(1),
          marketplace: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const { asins, marketplace } = input;

        if (!MARKETPLACES[marketplace]) {
          throw new Error(`不支持的站点: ${marketplace}`);
        }

        const cleanAsins = asins
          .map(a => a.trim().toUpperCase())
          .filter(a => /^[A-Z0-9]{10}$/.test(a));

        if (cleanAsins.length === 0) {
          throw new Error("没有有效的ASIN，ASIN应为10位字母数字组合");
        }

        const results = await scrapeProducts(cleanAsins, marketplace);

        return {
          total: cleanAsins.length,
          success: results.filter(r => r.status === "success").length,
          failed: results.filter(r => r.status === "failed").length,
          products: results,
        };
      }),

    // Reset session (clear cookies/fingerprint for fresh start)
    resetSession: publicProcedure
      .input(z.object({ marketplace: z.string().optional() }))
      .mutation(async ({ input }) => {
        resetSession(input.marketplace);
        return { success: true };
      }),

    // Get task history (simple list, legacy)
    getTasks: protectedProcedure.query(async ({ ctx }) => {
      return getUserTasks(ctx.user.id);
    }),

    // Get products for a specific task (simple, legacy)
    getTaskProducts: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return getTaskProducts(input.taskId);
      }),

    // ---- History API ----

    // Get paginated task history list
    getHistory: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }))
      .query(async ({ ctx, input }) => {
        return getUserTaskHistory(ctx.user.id, input.page, input.pageSize);
      }),

    // Get a single task's metadata
    getTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => {
        const task = await getTaskById(input.taskId);
        if (!task || task.userId !== ctx.user.id) {
          throw new Error("任务不存在或无权访问");
        }
        return task;
      }),

    // Get paginated products for a task (history detail)
    getHistoryProducts: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(30),
      }))
      .query(async ({ ctx, input }) => {
        // Verify ownership
        const task = await getTaskById(input.taskId);
        if (!task || task.userId !== ctx.user.id) {
          throw new Error("任务不存在或无权访问");
        }
        return getTaskProductsPaginated(input.taskId, input.page, input.pageSize);
      }),
  }),
});

export type AppRouter = typeof appRouter;
