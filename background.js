importScripts("store-adapters.js");


let updateRequestQueue = Promise.resolve();


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "updateAllPrices") {

    updateRequestQueue =
      updateRequestQueue.then(() =>
        handleUpdateRequest(message, sendResponse)
      );

    return true;
  }

});


async function handleUpdateRequest(message, sendResponse) {

  try {

    const result =
      await chrome.storage.local.get([
        "products",
        "updateStatus"
      ]);

    const allProducts =
      result.products || [];

    const requestedStore =
      typeof message.store === "string"
        ? message.store
        : null;

    const products =
      requestedStore
        ? allProducts.filter(product =>
            getProductStore(product) === requestedStore
          )
        : allProducts;


    if (result.updateStatus?.running) {

      sendResponse({
        success: false,
        message: "Обновление уже идёт."
      });

      return;
    }


    if (products.length === 0) {

      const message =
        requestedStore
          ? "Нет товаров этого магазина для обновления."
          : "Нет товаров для обновления.";

      await chrome.storage.local.set({
        updateStatus: {
          running: false,
          current: 0,
          total: 0,
          message,
          store: requestedStore
        }
      });

      sendResponse({
        success: false,
        message
      });

      return;
    }


    await chrome.storage.local.set({
      updateStatus: {
        running: true,
        current: 0,
        total: products.length,
        message: "Начинаю обновление...",
        store: requestedStore
      }
    });

    sendResponse({
      success: true,
      message: "Обновление запущено."
    });

    updateAllPrices(
      allProducts,
      products,
      requestedStore
    ).catch(error =>
      handleUpdateError(error, requestedStore)
    );

  } catch (error) {

    await handleUpdateError(error, message.store || null);

    sendResponse({
      success: false,
      message: "Не удалось запустить обновление."
    });
  }
}


async function handleUpdateError(error, store = null) {

  console.error(error);

  try {

    await chrome.storage.local.set({
      updateStatus: {
        running: false,
        message: "Обновление завершилось с ошибкой.",
        store
      }
    });

  } catch (storageError) {
    console.error(storageError);
  }
}


async function updateAllPrices(
  allProducts,
  products,
  requestedStore
) {

  for (let i = 0; i < products.length; i++) {

    const product = products[i];


    await chrome.storage.local.set({
      updateStatus: {
        running: true,
        current: i + 1,
        total: products.length,
        message: `Проверяю ${i + 1} из ${products.length}`,
        store: requestedStore
      }
    });


    try {

      const data =
        await readProductPage(product.url);


      if (data.name) {
        product.name = data.name;
      }


if (data.price) {

  const newPrice = Number(data.price);
  const oldPrice = Number(product.price);

  if (!Array.isArray(product.history)) {
    product.history = [];
  }

  if (
    Number.isFinite(oldPrice) &&
    oldPrice !== newPrice
  ) {
    product.history.push({
      date: new Date().toISOString(),
      price: oldPrice
    });
  }

  product.price = newPrice;

  product.updatedAt =
    new Date().toISOString();

  product.error = null;

} else {

        product.error =
          "Цена не найдена";
      }

    } catch (error) {

      console.error(
        "Ошибка при обновлении:",
        product.url,
        error
      );

      product.error =
        error.message;
    }


    await chrome.storage.local.set({
      products: allProducts
    });


    if (i < products.length - 1) {
      await sleep(750);
    }
  }


  await chrome.storage.local.set({
    products: allProducts,

    updateStatus: {
      running: false,
      current: products.length,
      total: products.length,
      message: "Готово.",
      store: requestedStore
    }
  });


  if (!requestedStore) {

    // Открываем результаты ТОЛЬКО после завершения общего обхода.
    await chrome.tabs.create({
      url: chrome.runtime.getURL("results.html")
    });
  }
}


function getProductStore(product) {

  return product.store ||
    PriceTrackerStores.getStore(product.url);
}


async function readProductPage(url) {

  const tab =
    await chrome.tabs.create({
      url,
      active: false
    });


  try {

    await waitForTab(tab.id);

    await chrome.scripting.executeScript({

      target: {
        tabId: tab.id
      },

      files: [
        "store-adapters.js"
      ]

    });


    const readinessResults =
      await chrome.scripting.executeScript({

        target: {
          tabId: tab.id
        },

        args: [10000],

        func: async timeoutMs => {

          const isReady = () =>
            PriceTrackerStores.isPriceReady(
              window.location.href,
              document
            );

          if (isReady()) {
            return true;
          }

          return new Promise(resolve => {

            const observer =
              new MutationObserver(() => {

                if (isReady()) {
                  clearTimeout(timeout);
                  observer.disconnect();
                  resolve(true);
                }
              });

            const timeout =
              setTimeout(() => {
                observer.disconnect();
                resolve(false);
              }, timeoutMs);

            observer.observe(
              document.documentElement,
              {
                childList: true,
                subtree: true
              }
            );

            if (isReady()) {
              clearTimeout(timeout);
              observer.disconnect();
              resolve(true);
            }
          });
        }

      });

    const isPriceReady =
      readinessResults[0]?.result;

    if (!isPriceReady) {
      throw new Error(
        "Цена не появилась за 10 секунд"
      );
    }


    const results =
      await chrome.scripting.executeScript({

        target: {
          tabId: tab.id
        },

        func: () => {
          return PriceTrackerStores.readProduct(
            window.location.href,
            document
          );
        }

      });


    return results[0]?.result || {};

  } finally {

    await chrome.tabs.remove(tab.id);
  }
}


function waitForTab(tabId) {

  return new Promise((resolve, reject) => {

    const timeout =
      setTimeout(() => {

        chrome.tabs.onUpdated.removeListener(listener);

        reject(
          new Error("Страница слишком долго загружается")
        );

      }, 30000);


    function listener(
      updatedTabId,
      changeInfo
    ) {

      if (
        updatedTabId === tabId &&
        changeInfo.status === "complete"
      ) {

        clearTimeout(timeout);

        chrome.tabs.onUpdated.removeListener(listener);

        resolve();
      }
    }


    chrome.tabs.onUpdated.addListener(listener);
  });
}


function sleep(ms) {

  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}
