import { describe, expect, it, vi, beforeEach } from "vitest";
import { MARKETPLACES, resetSession } from "./scraper";

describe("MARKETPLACES", () => {
  it("contains all major Amazon marketplaces", () => {
    expect(MARKETPLACES).toHaveProperty("US");
    expect(MARKETPLACES).toHaveProperty("UK");
    expect(MARKETPLACES).toHaveProperty("DE");
    expect(MARKETPLACES).toHaveProperty("FR");
    expect(MARKETPLACES).toHaveProperty("JP");
    expect(MARKETPLACES).toHaveProperty("CA");
    expect(MARKETPLACES).toHaveProperty("AU");
    expect(MARKETPLACES).toHaveProperty("IN");
  });

  it("has correct domain for US marketplace", () => {
    expect(MARKETPLACES.US.domain).toBe("www.amazon.com");
    expect(MARKETPLACES.US.name).toBe("美国");
  });

  it("has correct domain for UK marketplace", () => {
    expect(MARKETPLACES.UK.domain).toBe("www.amazon.co.uk");
  });

  it("has correct domain for JP marketplace", () => {
    expect(MARKETPLACES.JP.domain).toBe("www.amazon.co.jp");
  });

  it("has correct domain for DE marketplace", () => {
    expect(MARKETPLACES.DE.domain).toBe("www.amazon.de");
  });

  it("each marketplace has domain, name, flag, and lang", () => {
    for (const [code, mp] of Object.entries(MARKETPLACES)) {
      expect(mp.domain).toBeTruthy();
      expect(mp.name).toBeTruthy();
      expect(mp.flag).toBeTruthy();
      expect(mp.lang).toBeTruthy();
      expect(mp.domain).toContain("amazon");
    }
  });

  it("contains at least 15 marketplaces", () => {
    expect(Object.keys(MARKETPLACES).length).toBeGreaterThanOrEqual(15);
  });

  it("each marketplace has proper Accept-Language format", () => {
    for (const [code, mp] of Object.entries(MARKETPLACES)) {
      // Should contain at least one locale like en-US or de-DE
      expect(mp.lang).toMatch(/[a-z]{2}(-[A-Z]{2})?/);
    }
  });
});

describe("resetSession", () => {
  it("does not throw when resetting a specific marketplace", () => {
    expect(() => resetSession("US")).not.toThrow();
  });

  it("does not throw when resetting all sessions", () => {
    expect(() => resetSession()).not.toThrow();
  });

  it("does not throw for non-existent marketplace", () => {
    expect(() => resetSession("NONEXISTENT")).not.toThrow();
  });
});

describe("scrapeProduct (with mocked HTTP)", () => {
  beforeEach(() => {
    vi.resetModules();
    resetSession();
  });

  it("returns failed status for invalid marketplace", async () => {
    const { scrapeProduct } = await import("./scraper");
    const result = await scrapeProduct("B0XXXXXXXXX", "INVALID");
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("Unknown marketplace");
  });

  it("handles network errors gracefully", async () => {
    vi.doMock("axios", () => ({
      default: {
        get: vi.fn().mockRejectedValue(new Error("Network Error")),
      },
    }));

    const { scrapeProduct } = await import("./scraper");
    const result = await scrapeProduct("B0XXXXXXXXX", "US");
    expect(result).toHaveProperty("asin", "B0XXXXXXXXX");
    expect(result).toHaveProperty("marketplace", "US");
    expect(result.status).toBe("failed");

    vi.doUnmock("axios");
  }, 60000);
});

describe("HTML parsing logic", () => {
  it("parses a minimal Amazon product page", async () => {
    const mockHtml = `
      <html>
        <body>
          <span id="productTitle">Test Product Title</span>
          <a id="bylineInfo">Brand: TestBrand</a>
          <span class="a-price"><span class="a-offscreen">$29.99</span></span>
          <span class="a-icon-alt">4.5 out of 5 stars</span>
          <span id="acrCustomerReviewText">1,234 ratings</span>
          <div id="availability"><span>In Stock.</span></div>
          <div id="feature-bullets">
            <ul>
              <li><span class="a-list-item">Feature point 1</span></li>
              <li><span class="a-list-item">Feature point 2</span></li>
              <li><span class="a-list-item">Feature point 3</span></li>
            </ul>
          </div>
          <div id="productDescription"><p>This is the product description.</p></div>
          <img id="landingImage" src="https://images-na.ssl-images-amazon.com/images/I/test.jpg" />
          <div id="productDetails_techSpec_section_1">
            <table>
              <tr><th>Weight</th><td>2.5 lbs</td></tr>
              <tr><th>Dimensions</th><td>10 x 5 x 3 inches</td></tr>
            </table>
          </div>
          <div id="wayfinding-breadcrumbs_container">
            <a>Electronics</a>
            <a>Accessories</a>
          </div>
          <a id="sellerProfileTriggerId">TestSeller</a>
        </body>
      </html>
    `;

    const cheerio = await import("cheerio");
    const $ = cheerio.load(mockHtml);

    expect($("#productTitle").text().trim()).toBe("Test Product Title");
    expect($(".a-price .a-offscreen").first().text().trim()).toBe("$29.99");
    expect($("span.a-icon-alt").first().text().trim()).toBe("4.5 out of 5 stars");
    expect($("#acrCustomerReviewText").text().trim()).toBe("1,234 ratings");

    const bulletPoints: string[] = [];
    $("#feature-bullets ul li span.a-list-item").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2) bulletPoints.push(text);
    });
    expect(bulletPoints).toHaveLength(3);
    expect(bulletPoints[0]).toBe("Feature point 1");

    expect($("#productDescription p").text().trim()).toBe("This is the product description.");
    expect($("#landingImage").attr("src")).toBe("https://images-na.ssl-images-amazon.com/images/I/test.jpg");

    const specs: Record<string, string> = {};
    $("#productDetails_techSpec_section_1 tr").each((_, el) => {
      const key = $(el).find("th").text().trim();
      const value = $(el).find("td").text().trim();
      if (key && value) specs[key] = value;
    });
    expect(specs).toHaveProperty("Weight", "2.5 lbs");
    expect(specs).toHaveProperty("Dimensions", "10 x 5 x 3 inches");

    const categories = $("#wayfinding-breadcrumbs_container a").map((_, el) => $(el).text().trim()).get().join(" > ");
    expect(categories).toBe("Electronics > Accessories");
    expect($("#sellerProfileTriggerId").text().trim()).toBe("TestSeller");
  });
});

describe("ASIN validation", () => {
  it("validates correct ASIN format", () => {
    const validAsins = ["B08N5WRWNW", "0123456789", "B0BSHF7WHW"];
    const invalidAsins = ["B0XX", "TOOLONGASIN1", "", "B0X X X X X", "b08n5wrwnw"];

    for (const asin of validAsins) {
      expect(/^[A-Z0-9]{10}$/.test(asin)).toBe(true);
    }

    for (const asin of invalidAsins) {
      expect(/^[A-Z0-9]{10}$/.test(asin)).toBe(false);
    }
  });
});
