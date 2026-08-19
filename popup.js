const customNameElement =
  document.getElementById("customName");

const targetPriceElement =
  document.getElementById("targetPrice");

const readButton =
  document.getElementById("readPrice");

const saveButton =
  document.getElementById("saveProduct");

const updateButton =
  document.getElementById("updateAll");

const currentProductElement =
  document.getElementById("currentProduct");

const nameElement =
  document.getElementById("name");

const priceElement =
  document.getElementById("price");

const messageElement =
  document.getElementById("message");

const updateStatusElement =
  document.getElementById("updateStatus");

const productsElement =
  document.getElementById("products");


let currentProduct = null;


readButton.addEventListener(
  "click",
  readCurrentProduct
);

saveButton.addEventListener(
  "click",
  saveCurrentProduct
);

updateButton.addEventListener(
  "click",
  updateAllPrices
);


async function readCurrentProduct() {

  messageElement.textContent = "";


  let data;


  try {

    const [tab] =
      await chrome.tabs.query({
        active: true,
        currentWindow: true
      });


    const store =
      PriceTrackerStores.getStore(tab.url);

    const protocol =
      new URL(tab.url).protocol;


    if (
      !store &&
      (protocol === "http:" || protocol === "https:")
    ) {

      currentProduct = null;

      currentProductElement.hidden = true;

      messageElement.textContent =
        "Этот магазин пока не поддерживается.";

      return;
    }


    await chrome.scripting.executeScript({

      target: {
        tabId: tab.id
      },

      files: [
        "store-adapters.js"
      ]

    });


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


    data = results[0]?.result || {};


    if (!data.store) {

      currentProduct = null;

      currentProductElement.hidden = true;

      messageElement.textContent =
        "Этот магазин пока не поддерживается.";

      return;
    }

  } catch (error) {

    console.error(error);

    currentProduct = null;

    currentProductElement.hidden = true;

    messageElement.textContent =
      "Не удалось прочитать эту страницу.";

    return;
  }


  if (!data.name || !data.price) {

    currentProduct = null;

    currentProductElement.hidden = true;

    messageElement.textContent =
      "Не удалось найти товар или цену.";

    return;
  }


  currentProduct = data;

  nameElement.textContent =
    currentProduct.name;

  priceElement.textContent =
    `${currentProduct.price} ₽`;

  currentProductElement.hidden = false;

  customNameElement.value =
    currentProduct.name;

  targetPriceElement.value = "";
}


async function saveCurrentProduct() {

  if (!currentProduct) {
    return;
  }

  const result =
    await chrome.storage.local.get("products");

  const products =
    result.products || [];

  const existingProduct =
    products.find(
      product =>
        product.url === currentProduct.url
    );

  const customName =
    customNameElement.value.trim()
    || currentProduct.name;

  const targetPriceValue =
    targetPriceElement.value.trim();

  const targetPrice =
    targetPriceValue
      ? Number(targetPriceValue)
      : null;


  if (existingProduct) {

    existingProduct.name =
      currentProduct.name;

    existingProduct.customName =
      customName;

    existingProduct.targetPrice =
      targetPrice;

    existingProduct.price =
      Number(currentProduct.price);

    existingProduct.updatedAt =
      new Date().toISOString();

    existingProduct.error = null;

    messageElement.textContent =
      "Товар обновлён.";

  } else {

    products.push({

      name:
        currentProduct.name,

      customName,

      price:
        Number(currentProduct.price),

      targetPrice,

      url:
        currentProduct.url,

      store:
        currentProduct.store,

      updatedAt:
        new Date().toISOString(),

      error:
        null,

      history:
        [],

      firstSeenAt:
        new Date().toISOString(),

      firstPrice:
        Number(currentProduct.price)

    });

    messageElement.textContent =
      "Товар сохранён.";
  }


  await chrome.storage.local.set({
    products
  });

  await renderProducts();
}


async function updateAllPrices() {

  updateStatusElement.textContent =
    "Запускаю обновление...";


  const response =
    await chrome.runtime.sendMessage({
      action: "updateAllPrices"
    });


  if (!response.success) {

    updateStatusElement.textContent =
      response.message;

    return;
  }


  updateStatusElement.textContent =
    response.message;
}


async function renderProducts() {

  const result =
    await chrome.storage.local.get([
      "products",
      "updateStatus"
    ]);


  const products =
    result.products || [];

  const status =
    result.updateStatus;


  productsElement.innerHTML = "";


  if (status) {

    updateStatusElement.textContent =
      status.message;

    updateButton.disabled =
      status.running;

  } else {

    updateButton.disabled = false;
  }


  if (products.length === 0) {

    productsElement.textContent =
      "Пока ничего не сохранено.";

    return;
  }


  for (const product of products) {

    const container =
      document.createElement("div");

    container.className =
      "product";


    const name =
      document.createElement("div");

    name.className =
      "product-name";

    name.textContent =
      product.customName || product.name;


    const price =
      document.createElement("div");

    price.className =
      "product-price";

    price.textContent =
      `${product.price} ₽`;

    if (product.targetPrice !== null &&
    product.targetPrice !== undefined) {

  const target =
    document.createElement("div");

  target.textContent =
    `Цель: ${Number(product.targetPrice).toFixed(2)} ₽`;

  container.appendChild(target);
}


    container.appendChild(name);

    container.appendChild(price);


    if (product.updatedAt) {

      const updated =
        document.createElement("div");

      updated.className =
        "product-updated";

      updated.textContent =
        "Обновлено: " +
        new Date(
          product.updatedAt
        ).toLocaleString();

      container.appendChild(updated);
    }


    if (product.error) {

      const error =
        document.createElement("div");

      error.className =
        "product-error";

      error.textContent =
        `Ошибка: ${product.error}`;

      container.appendChild(error);
    }


    const deleteButton =
      document.createElement("button");

    deleteButton.className =
      "delete-button";

    deleteButton.textContent =
      "Удалить";

    deleteButton.addEventListener(
      "click",
      async () => {

        await deleteProduct(
          product.url
        );

      }
    );


    container.appendChild(
      deleteButton
    );


    productsElement.appendChild(
      container
    );
  }
}


async function deleteProduct(url) {

  const result =
    await chrome.storage.local.get("products");

  const products =
    result.products || [];


  const newProducts =
    products.filter(
      product =>
        product.url !== url
    );


  await chrome.storage.local.set({
    products: newProducts
  });


  await renderProducts();
}


chrome.storage.onChanged.addListener(
  async changes => {

    if (
      changes.products ||
      changes.updateStatus
    ) {

      await renderProducts();
    }

  }
);


renderProducts();
