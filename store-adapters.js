(function () {

  function findOffersPrice(value) {

    if (Array.isArray(value)) {

      for (const item of value) {

        const price = findOffersPrice(item);

        if (price !== undefined) {
          return price;
        }
      }

      return undefined;
    }

    if (!value || typeof value !== "object") {
      return undefined;
    }

    const offers = value.offers;

    if (offers) {

      const offerItems =
        Array.isArray(offers)
          ? offers
          : [offers];

      for (const offer of offerItems) {

        const rawPrice =
          offer?.price;

        const price =
          Number(rawPrice);

        if (
          rawPrice !== null &&
          rawPrice !== undefined &&
          String(rawPrice).trim() !== "" &&
          Number.isFinite(price)
        ) {
          return price;
        }
      }
    }

    for (const item of Object.values(value)) {

      const price = findOffersPrice(item);

      if (price !== undefined) {
        return price;
      }
    }

    return undefined;
  }


  function readJsonLdPrice(document) {

    const scripts =
      document.querySelectorAll(
        'script[type="application/ld+json"]'
      );

    for (const script of scripts) {

      try {

        const data =
          JSON.parse(script.textContent);

        const price =
          findOffersPrice(data);

        if (price !== undefined) {
          return price;
        }

      } catch (error) {
        // Некорректный JSON-LD не мешает проверке остальных блоков.
      }
    }

    return undefined;
  }


  function readFivePrice(document) {

    const prices =
      Array.from(
        document.querySelectorAll(
          'meta[itemprop="price"]'
        )
      )
        .map(element => Number(element.content))
        .filter(Number.isFinite);

    return prices.length > 0
      ? Math.min(...prices)
      : undefined;
  }


  function readLavkaPrice(document) {

    const priceText =
      document.querySelector(
        '[data-testid="product-card-content"] [data-testid="price-text"]'
      )?.textContent?.trim();

    if (!priceText) {
      return undefined;
    }

    const normalizedPrice =
      priceText
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "");

    const price = Number(normalizedPrice);

    return normalizedPrice && Number.isFinite(price)
      ? price
      : undefined;
  }


  function parseSmartPrice(priceText) {

    const match =
      priceText?.match(/\d+(?:[.,]\d+)?/);

    if (!match) {
      return undefined;
    }

    const price =
      Number(match[0].replace(",", "."));

    return Number.isFinite(price)
      ? price
      : undefined;
  }


  function readSmartPrice(document) {

    const discountPrice =
      parseSmartPrice(
        document.querySelector(
          ".price-with-discount"
        )?.textContent
      );

    if (discountPrice !== undefined) {
      return discountPrice;
    }

    return parseSmartPrice(
      document.querySelector(
        ".full-price"
      )?.textContent
    );
  }


  function findMagnitProductPrice(value) {

    if (Array.isArray(value)) {

      for (const item of value) {

        const price =
          findMagnitProductPrice(item);

        if (price !== undefined) {
          return price;
        }
      }

      return undefined;
    }

    if (!value || typeof value !== "object") {
      return undefined;
    }

    if (value["@type"] === "Product") {

      const offers =
        Array.isArray(value.offers)
          ? value.offers
          : [value.offers];

      for (const offer of offers) {

        const rawPrice = offer?.price;
        const price = Number(rawPrice);

        if (
          rawPrice !== null &&
          rawPrice !== undefined &&
          String(rawPrice).trim() !== "" &&
          Number.isFinite(price)
        ) {
          return price;
        }
      }
    }

    return findMagnitProductPrice(
      value["@graph"]
    );
  }


  function parseMagnitFallbackPrice(priceText) {

    const match =
      priceText?.match(/\d+(?:[.,]\d+)?/);

    if (!match) {
      return undefined;
    }

    const price =
      Number(match[0].replace(",", "."));

    return Number.isFinite(price)
      ? price
      : undefined;
  }


  function readMagnitPrice(document) {

    const scripts =
      document.querySelectorAll(
        'script[type="application/ld+json"]'
      );

    for (const script of scripts) {

      try {

        const data =
          JSON.parse(script.textContent);

        const price =
          findMagnitProductPrice(data);

        if (price !== undefined) {
          return price;
        }

      } catch (error) {
        // Некорректный JSON-LD не мешает проверке остальных блоков.
      }
    }

    return parseMagnitFallbackPrice(
      document.querySelector(
        '[data-test-id^="v-product-detail-price-current"]'
      )?.textContent
    );
  }


  const adapters = [
    {
      store: "5ka",
      hostnames: [
        "5ka.ru",
        "www.5ka.ru"
      ],
      isPriceReady(document) {
        return Number.isFinite(
          readFivePrice(document)
        );
      },
      read(document) {

        const name =
          document.querySelector("h1")
            ?.innerText
            ?.trim();

        const price =
          readFivePrice(document);

        return {
          name,
          price
        };
      }
    },
    {
      store: "globus",
      hostnames: [
        "globus.ru",
        "www.globus.ru"
      ],
      isPriceReady(document) {
        return Boolean(
          document.querySelector(
            '[itemprop="price"]'
          ) ||
          document.querySelector(
            ".catalog-detail__item-price-actual-main"
          )
        );
      },
      read(document) {

        const name =
          document.querySelector("h1")
            ?.innerText
            ?.trim();

        const priceElement =
          document.querySelector(
            '[itemprop="price"]'
          );

        const rubles =
          priceElement
            ?.innerText
            ?.trim();

        const pennies =
          priceElement
            ?.nextElementSibling
            ?.querySelector("div")
            ?.innerText
            ?.trim();

        const newPrice =
          Number(`${rubles}.${pennies}`);


        const priceMain =
          document.querySelector(
            ".catalog-detail__item-price-actual-main"
          )?.textContent?.trim();

        const priceSub =
          document.querySelector(
            ".catalog-detail__item-price-actual-sub"
          )?.textContent?.trim();

        const fallbackPrice =
          Number(`${priceMain}.${priceSub}`);

        const price =
          rubles &&
          pennies &&
          Number.isFinite(newPrice)
            ? newPrice
            : priceMain &&
              priceSub &&
              Number.isFinite(fallbackPrice)
              ? fallbackPrice
              : undefined;

        return {
          name,
          price
        };
      }
    },
    {
      store: "dixy",
      hostnames: [
        "dixy.ru",
        "www.dixy.ru"
      ],
      isPriceReady(document) {
        return Number.isFinite(
          readJsonLdPrice(document)
        );
      },
      read(document) {

        const name =
          document.querySelector("h1")
            ?.innerText
            ?.trim();

        const price =
          readJsonLdPrice(document);

        return {
          name,
          price
        };
      }
    },
    {
      store: "lavka",
      hostnames: [
        "lavka.yandex.ru"
      ],
      isPriceReady(document) {
        return Number.isFinite(
          readLavkaPrice(document)
        );
      },
      read(document) {

        const name =
          document.querySelector(
            '[data-testid="product-title"]'
          )?.innerText?.trim() ||
          document.querySelector(
            'h1[itemprop="name"]'
          )?.innerText?.trim();

        const price =
          readLavkaPrice(document);

        return {
          name,
          price
        };
      }
    },
    {
      store: "smart",
      hostnames: [
        "smart.swnn.ru"
      ],
      isPriceReady(document) {
        return Number.isFinite(
          readSmartPrice(document)
        );
      },
      read(document) {

        const name =
          document.querySelector(
            ".product-main-info-name"
          )?.innerText?.trim();

        const price =
          readSmartPrice(document);

        return {
          name,
          price
        };
      }
    },
    {
      store: "magnit",
      hostnames: [
        "magnit.ru",
        "www.magnit.ru"
      ],
      isPriceReady(document) {
        return Number.isFinite(
          readMagnitPrice(document)
        );
      },
      read(document) {

        const name =
          document.querySelector("h1")
            ?.innerText
            ?.trim();

        const price =
          readMagnitPrice(document);

        return {
          name,
          price
        };
      }
    }
  ];


  function getAdapter(url) {

    let hostname;

    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch (error) {
      return null;
    }

    return adapters.find(adapter =>
      adapter.hostnames.includes(hostname)
    ) || null;
  }


  function getStore(url) {

    return getAdapter(url)?.store || null;
  }


  function readProduct(url, document) {

    const adapter = getAdapter(url);

    if (!adapter) {
      return null;
    }

    return {
      ...adapter.read(document),
      store: adapter.store,
      url
    };
  }


  function isPriceReady(url, document) {

    const adapter = getAdapter(url);

    return adapter
      ? adapter.isPriceReady(document)
      : false;
  }


  globalThis.PriceTrackerStores = {
    getStore,
    readProduct,
    isPriceReady
  };

})();
