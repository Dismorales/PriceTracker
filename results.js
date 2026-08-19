const storeConfig = [
  {
    key: "5ka",
    name: "Пятёрочка",
    sectionId: "store-5ka",
    hostnames: ["5ka.ru", "www.5ka.ru"]
  },
  {
    key: "globus",
    name: "Глобус",
    sectionId: "store-globus",
    hostnames: ["globus.ru", "www.globus.ru"]
  },
  {
    key: "dixy",
    name: "Дикси",
    sectionId: "store-dixy",
    hostnames: ["dixy.ru", "www.dixy.ru"]
  },
  {
    key: "lavka",
    name: "Яндекс Лавка",
    sectionId: "store-lavka",
    hostnames: ["lavka.yandex.ru"]
  },
  {
    key: "smart",
    name: "Smart",
    sectionId: "store-smart",
    hostnames: ["smart.swnn.ru"]
  },
  {
    key: "magnit",
    name: "Магнит",
    sectionId: "store-magnit",
    hostnames: ["magnit.ru", "www.magnit.ru"]
  },
  {
    key: "other",
    name: "Другие",
    sectionId: "store-other",
    hostnames: []
  }
];


const columnNames = [
  "Товар",
  "Сейчас",
  "Предыдущая",
  "Изменение",
  "Минимум",
  "Цель",
  "Обновлено",
  "Статус",
  "Действия"
];


let editingProductUrl = null;
let currentUpdateStatus = null;
let currentStoreOrder = [];


const exportBackupButton =
  document.getElementById("exportBackup");

const importBackupButton =
  document.getElementById("importBackup");

const backupFileInput =
  document.getElementById("backupFile");

const backupMessage =
  document.getElementById("backupMessage");


exportBackupButton.addEventListener(
  "click",
  exportBackup
);

importBackupButton.addEventListener(
  "click",
  selectBackupFile
);

backupFileInput.addEventListener(
  "change",
  importBackup
);


function createBackupData(products, storeOrder) {

  return {
    format: "PriceTrackerBackup",
    version: 1,
    exportedAt: new Date().toISOString(),
    products,
    storeOrder: storeOrder ?? null
  };
}


async function exportBackup() {

  backupMessage.textContent = "";

  try {

    const result =
      await chrome.storage.local.get([
        "products",
        "storeOrder"
      ]);

    const backup =
      createBackupData(
        result.products || [],
        result.storeOrder
      );

    const json =
      JSON.stringify(backup, null, 2);

    const blob =
      new Blob(
        [json],
        { type: "application/json" }
      );

    const objectUrl =
      URL.createObjectURL(blob);

    const downloadLink =
      document.createElement("a");

    downloadLink.href = objectUrl;
    downloadLink.download =
      `pricetracker-backup-${backup.exportedAt.slice(0, 10)}.json`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    URL.revokeObjectURL(objectUrl);

    backupMessage.textContent =
      "Резервная копия сохранена.";

  } catch (error) {

    console.error(error);

    backupMessage.textContent =
      "Не удалось создать резервную копию.";
  }
}


async function selectBackupFile() {

  backupMessage.textContent = "";

  const result =
    await chrome.storage.local.get("updateStatus");

  if (result.updateStatus?.running) {
    backupMessage.textContent =
      "Нельзя импортировать данные во время обновления цен.";
    return;
  }

  backupFileInput.click();
}


function validateBackup(backup) {

  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new Error("Файл не является резервной копией PriceTracker.");
  }

  if (backup.format !== "PriceTrackerBackup") {
    throw new Error("Неверный формат резервной копии.");
  }

  if (backup.version !== 1) {
    throw new Error("Версия резервной копии не поддерживается.");
  }

  if (!Array.isArray(backup.products)) {
    throw new Error("Список товаров в резервной копии повреждён.");
  }

  if (
    !backup.products.every(product =>
      product &&
      typeof product === "object" &&
      !Array.isArray(product)
    )
  ) {
    throw new Error("Резервная копия содержит некорректный товар.");
  }

  if (
    backup.storeOrder !== null &&
    backup.storeOrder !== undefined &&
    !Array.isArray(backup.storeOrder)
  ) {
    throw new Error("Порядок магазинов в резервной копии повреждён.");
  }
}


async function importBackup() {

  const file =
    backupFileInput.files?.[0];

  if (!file) {
    return;
  }

  backupMessage.textContent = "";

  try {

    const text =
      await file.text();

    let backup;

    try {
      backup = JSON.parse(text);
    } catch (error) {
      throw new Error("Не удалось прочитать JSON-файл.");
    }

    validateBackup(backup);

    const statusResult =
      await chrome.storage.local.get("updateStatus");

    if (statusResult.updateStatus?.running) {
      throw new Error(
        "Нельзя импортировать данные во время обновления цен."
      );
    }

    const confirmed = confirm(
      "Импорт заменит текущий список товаров и настройки порядка магазинов данными из резервной копии. Продолжить?"
    );

    if (!confirmed) {
      return;
    }

    const latestStatusResult =
      await chrome.storage.local.get("updateStatus");

    if (latestStatusResult.updateStatus?.running) {
      throw new Error(
        "Нельзя импортировать данные во время обновления цен."
      );
    }

    if (Array.isArray(backup.storeOrder)) {
      await chrome.storage.local.set({
        products: backup.products,
        storeOrder: backup.storeOrder
      });
    } else {
      await chrome.storage.local.set({
        products: backup.products
      });

      await chrome.storage.local.remove("storeOrder");
    }

    await renderResults();

    backupMessage.textContent =
      "Резервная копия восстановлена.";

  } catch (error) {

    console.error(error);

    backupMessage.textContent =
      error.message ||
      "Не удалось восстановить резервную копию.";

  } finally {
    backupFileInput.value = "";
  }
}


async function renderResults() {

  const result =
    await chrome.storage.local.get([
      "products",
      "updateStatus",
      "storeOrder"
    ]);

  const products =
    result.products || [];

  currentUpdateStatus =
    result.updateStatus || null;

  const orderedStores =
    getOrderedStores(result.storeOrder);

  currentStoreOrder =
    orderedStores
      .filter(store => store.key !== "other")
      .map(store => store.key);

  const summary =
    document.getElementById("summary");

  const navigation =
    document.getElementById("storeNavigation");

  const sections =
    document.getElementById("storeSections");

  summary.textContent =
    `Проверено товаров: ${products.length}`;

  navigation.innerHTML = "";
  sections.innerHTML = "";


  const groupedProducts =
    new Map(
      storeConfig.map(store => [store.key, []])
    );

  for (const product of products) {
    groupedProducts
      .get(getProductStore(product))
      .push(product);
  }


  const visibleStores =
    orderedStores.filter(store =>
      groupedProducts.get(store.key).length > 0
    );

  const visibleKnownStores =
    visibleStores.filter(store =>
      store.key !== "other"
    );

  renderNavigation(navigation, visibleStores);

  for (const store of visibleStores) {
    sections.appendChild(
      createStoreSection(
        store,
        groupedProducts.get(store.key),
        visibleKnownStores
      )
    );
  }
}


function getOrderedStores(savedOrder) {

  const knownStores =
    storeConfig.filter(store =>
      store.key !== "other"
    );

  const knownStoreKeys =
    new Set(knownStores.map(store => store.key));

  const orderedKeys = [];

  if (Array.isArray(savedOrder)) {

    for (const key of savedOrder) {

      if (
        knownStoreKeys.has(key) &&
        !orderedKeys.includes(key)
      ) {
        orderedKeys.push(key);
      }
    }
  }

  for (const store of knownStores) {

    if (!orderedKeys.includes(store.key)) {
      orderedKeys.push(store.key);
    }
  }

  const orderedStores =
    orderedKeys.map(key =>
      knownStores.find(store => store.key === key)
    );

  const otherStore =
    storeConfig.find(store => store.key === "other");

  if (otherStore) {
    orderedStores.push(otherStore);
  }

  return orderedStores;
}


function getProductStore(product) {

  const configuredStore =
    storeConfig.find(store =>
      store.key !== "other" &&
      store.key === product.store
    );

  if (configuredStore) {
    return product.store;
  }

  if (
    product.store === null ||
    product.store === undefined
  ) {

    try {

      const hostname =
        new URL(product.url).hostname.toLowerCase();

      const store =
        storeConfig.find(item =>
          item.hostnames.includes(hostname)
        );

      if (store) {
        return store.key;
      }

    } catch (error) {
      // Неизвестный или некорректный URL относится к секции «Другие».
    }
  }

  return "other";
}


function renderNavigation(navigation, visibleStores) {

  const links = [
    {
      name: "Все магазины",
      href: "#top"
    },
    ...visibleStores.map(store => ({
      name: store.name,
      href: `#${store.sectionId}`
    }))
  ];

  links.forEach((item, index) => {

    if (index > 0) {
      navigation.appendChild(
        document.createTextNode(" · ")
      );
    }

    const link =
      document.createElement("a");

    link.href = item.href;
    link.textContent = item.name;

    navigation.appendChild(link);
  });
}


function createStoreSection(
  store,
  products,
  visibleKnownStores
) {

  const section =
    document.createElement("section");

  section.id = store.sectionId;
  section.className = "store-section";

  const title =
    document.createElement("h2");

  title.className = "store-title";
  title.textContent = store.name;

  const header =
    document.createElement("div");

  header.className = "store-header";

  const heading =
    document.createElement("div");

  heading.className = "store-heading";
  heading.appendChild(title);

  if (store.key !== "other") {

    heading.appendChild(
      createStoreOrderControls(
        store,
        visibleKnownStores
      )
    );
  }

  const topLink =
    document.createElement("a");

  topLink.href = "#top";
  topLink.className = "store-top-link";
  topLink.textContent = "↑ Все магазины";

  heading.appendChild(topLink);
  header.appendChild(heading);

  if (store.key !== "other") {

    const headerActions =
      document.createElement("div");

    headerActions.className = "store-header-actions";

    headerActions.appendChild(
      createStoreUpdateControl(store)
    );

    header.appendChild(headerActions);
  }

  section.appendChild(header);
  section.appendChild(createProductsTable(products));

  return section;
}


function createStoreOrderControls(
  store,
  visibleKnownStores
) {

  const controls =
    document.createElement("div");

  controls.className = "store-order-controls";

  const visibleIndex =
    visibleKnownStores.findIndex(item =>
      item.key === store.key
    );

  const upButton =
    document.createElement("button");

  upButton.type = "button";
  upButton.className = "store-order-button";
  upButton.textContent = "↑";
  upButton.title = "Поднять магазин выше";
  upButton.disabled = visibleIndex <= 0;

  const downButton =
    document.createElement("button");

  downButton.type = "button";
  downButton.className = "store-order-button";
  downButton.textContent = "↓";
  downButton.title = "Опустить магазин ниже";
  downButton.disabled =
    visibleIndex === visibleKnownStores.length - 1;

  upButton.addEventListener(
    "click",
    async () => {
      await moveStore(
        store.key,
        visibleKnownStores[visibleIndex - 1].key
      );
    }
  );

  downButton.addEventListener(
    "click",
    async () => {
      await moveStore(
        store.key,
        visibleKnownStores[visibleIndex + 1].key
      );
    }
  );

  controls.appendChild(upButton);
  controls.appendChild(downButton);

  return controls;
}


async function moveStore(storeKey, neighborKey) {

  const newOrder =
    [...currentStoreOrder];

  const storeIndex =
    newOrder.indexOf(storeKey);

  const neighborIndex =
    newOrder.indexOf(neighborKey);

  if (storeIndex < 0 || neighborIndex < 0) {
    return;
  }

  [
    newOrder[storeIndex],
    newOrder[neighborIndex]
  ] = [
    newOrder[neighborIndex],
    newOrder[storeIndex]
  ];

  await chrome.storage.local.set({
    storeOrder: newOrder
  });

  await renderResults();
}


function createStoreUpdateControl(store) {

  const control =
    document.createElement("div");

  control.className = "store-update-control";

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "store-update-button";
  button.textContent = "Обновить цены";

  const status =
    document.createElement("div");

  status.className = "store-update-status";

  if (currentUpdateStatus?.running) {

    button.disabled = true;

    if (currentUpdateStatus.store === store.key) {

      button.textContent =
        currentUpdateStatus.current > 0
          ? `Обновляю ${currentUpdateStatus.current} из ${currentUpdateStatus.total}...`
          : "Запускаю...";
    }
  }

  button.addEventListener(
    "click",
    async () => {

      button.disabled = true;
      button.textContent = "Запускаю...";
      status.textContent = "";

      try {

        const response =
          await chrome.runtime.sendMessage({
            action: "updateAllPrices",
            store: store.key
          });

        status.textContent =
          response.message;

        if (!response.success) {
          button.disabled = false;
          button.textContent = "Обновить цены";
        }

      } catch (error) {

        console.error(error);

        button.disabled = false;
        button.textContent = "Обновить цены";
        status.textContent =
          "Не удалось запустить обновление.";
      }
    }
  );

  control.appendChild(button);
  control.appendChild(status);

  return control;
}


function createProductsTable(products) {

  const sortedProducts =
    [...products].sort(compareProducts);

  const table =
    document.createElement("table");

  const tableHead =
    document.createElement("thead");

  const headerRow =
    document.createElement("tr");

  for (const columnName of columnNames) {

    const header =
      document.createElement("th");

    header.textContent = columnName;
    headerRow.appendChild(header);
  }

  tableHead.appendChild(headerRow);
  table.appendChild(tableHead);

  const tableBody =
    document.createElement("tbody");

  for (const product of sortedProducts) {
    tableBody.appendChild(createProductRow(product));
  }

  table.appendChild(tableBody);

  return table;
}


function compareProducts(firstProduct, secondProduct) {

  const priorityDifference =
    getProductPriority(firstProduct) -
    getProductPriority(secondProduct);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const firstName =
    firstProduct.customName || firstProduct.name || "";

  const secondName =
    secondProduct.customName || secondProduct.name || "";

  return firstName.localeCompare(
    secondName,
    "ru"
  );
}


function getProductPriority(product) {

  if (product.error) {
    return 4;
  }

  const currentPrice =
    Number(product.price);

  const hasTarget =
    product.targetPrice !== null &&
    product.targetPrice !== undefined;

  const targetPrice =
    hasTarget
      ? Number(product.targetPrice)
      : null;

  if (
    hasTarget &&
    Number.isFinite(targetPrice) &&
    Number.isFinite(currentPrice) &&
    currentPrice <= targetPrice
  ) {
    return 0;
  }

  const history =
    Array.isArray(product.history)
      ? product.history
      : [];

  const previousPrice =
    history.length > 0
      ? Number(history[history.length - 1].price)
      : null;

  if (
    previousPrice !== null &&
    currentPrice < previousPrice
  ) {
    return 1;
  }

  if (
    previousPrice !== null &&
    currentPrice > previousPrice
  ) {
    return 3;
  }

  return 2;
}


function createProductRow(product) {

  const row =
    document.createElement("tr");

  const isEditing =
    editingProductUrl === product.url;

  const history =
    Array.isArray(product.history)
      ? product.history
      : [];

  const currentPrice =
    Number(product.price);

  const hasTarget =
    product.targetPrice !== null &&
    product.targetPrice !== undefined;

  const targetPrice =
    hasTarget
      ? Number(product.targetPrice)
      : null;

  if (
    hasTarget &&
    Number.isFinite(targetPrice) &&
    Number.isFinite(currentPrice) &&
    currentPrice <= targetPrice
  ) {
    row.className = "target-hit";
  }

  const previousPrice =
    history.length > 0
      ? Number(history[history.length - 1].price)
      : null;

  const allPrices = [
    currentPrice,
    ...history.map(item => Number(item.price))
  ].filter(Number.isFinite);

  const minPrice =
    allPrices.length > 0
      ? Math.min(...allPrices)
      : null;

  const difference =
    previousPrice !== null
      ? currentPrice - previousPrice
      : null;


  const nameCell =
    document.createElement("td");

  let nameInput = null;

  if (isEditing) {

    nameInput =
      document.createElement("input");

    nameInput.type = "text";
    nameInput.className = "edit-input";
    nameInput.value =
      product.customName || product.name;

    nameCell.appendChild(nameInput);

  } else {

    const link =
      document.createElement("a");

    link.href = product.url;
    link.target = "_blank";
    link.textContent =
      product.customName || product.name;

    nameCell.appendChild(link);
  }


  const currentCell =
    document.createElement("td");

  currentCell.className = "price";
  currentCell.textContent =
    Number.isFinite(currentPrice)
      ? `${currentPrice.toFixed(2)} ₽`
      : "—";


  const previousCell =
    document.createElement("td");

  previousCell.textContent =
    previousPrice !== null
      ? `${previousPrice.toFixed(2)} ₽`
      : "—";


  const differenceCell =
    document.createElement("td");

  if (difference === null) {
    differenceCell.textContent = "—";
  } else if (difference < 0) {
    differenceCell.textContent =
      `↓ ${Math.abs(difference).toFixed(2)} ₽`;
    differenceCell.className = "price-down";
  } else if (difference > 0) {
    differenceCell.textContent =
      `↑ ${difference.toFixed(2)} ₽`;
    differenceCell.className = "price-up";
  } else {
    differenceCell.textContent = "—";
  }


  const minCell =
    document.createElement("td");

  minCell.textContent =
    minPrice !== null
      ? `${minPrice.toFixed(2)} ₽`
      : "—";


  const targetCell =
    document.createElement("td");

  let targetInput = null;

  if (isEditing) {

    targetInput =
      document.createElement("input");

    targetInput.type = "number";
    targetInput.step = "0.01";
    targetInput.min = "0";
    targetInput.className =
      "edit-input target-price-input";
    targetInput.value =
      hasTarget && Number.isFinite(targetPrice)
        ? String(product.targetPrice)
        : "";

    targetCell.appendChild(targetInput);

  } else {

    targetCell.textContent =
      hasTarget && Number.isFinite(targetPrice)
        ? `${targetPrice.toFixed(2)} ₽`
        : "—";
  }


  const updatedCell =
    document.createElement("td");

  updatedCell.className = "updated";
  updatedCell.textContent =
    product.updatedAt
      ? new Date(product.updatedAt).toLocaleString()
      : "—";


  const statusCell =
    document.createElement("td");

  if (product.error) {
    statusCell.textContent = getShortErrorStatus(product.error);
    statusCell.title = product.error;
    statusCell.className = "error";
  } else {
    statusCell.textContent = "ОК";
  }


  const actionsCell =
    document.createElement("td");

  actionsCell.className = "edit-actions";

  if (isEditing) {

    const actionButtons =
      document.createElement("div");

    actionButtons.className =
      "editing-action-buttons";

    const saveButton =
      document.createElement("button");

    saveButton.type = "button";
    saveButton.className =
      "edit-button edit-icon-button save-action-button";
    saveButton.title = "Сохранить";
    saveButton.setAttribute(
      "aria-label",
      "Сохранить"
    );
    appendActionIcon(
      saveButton,
      "M5 13l4 4L19 7"
    );

    const cancelButton =
      document.createElement("button");

    cancelButton.type = "button";
    cancelButton.className =
      "edit-button edit-icon-button cancel-action-button";
    cancelButton.title = "Отмена";
    cancelButton.setAttribute(
      "aria-label",
      "Отмена"
    );
    appendActionIcon(
      cancelButton,
      "M6 6l12 12 M18 6L6 18"
    );

    const editError =
      document.createElement("div");

    editError.className = "edit-error";

    saveButton.addEventListener(
      "click",
      async () => {

        const targetValue =
          targetInput.value.trim();

        const newTargetPrice =
          targetValue === ""
            ? null
            : Number(targetValue);

        if (
          !targetInput.validity.valid ||
          (newTargetPrice !== null &&
          (!Number.isFinite(newTargetPrice) ||
          newTargetPrice < 0))
        ) {

          editError.textContent =
            "Введите корректную неотрицательную цену.";

          return;
        }

        try {

          const result =
            await chrome.storage.local.get("products");

          const products =
            result.products || [];

          const storedProduct =
            products.find(item =>
              item.url === product.url
            );

          if (!storedProduct) {
            editError.textContent =
              "Не удалось найти сохранённый товар.";
            return;
          }

          storedProduct.customName =
            nameInput.value.trim();

          storedProduct.targetPrice =
            newTargetPrice;

          await chrome.storage.local.set({
            products
          });

          editingProductUrl = null;

          await renderResults();

        } catch (error) {

          console.error(error);

          editError.textContent =
            "Не удалось сохранить изменения.";
        }
      }
    );

    cancelButton.addEventListener(
      "click",
      async () => {

        editingProductUrl = null;

        await renderResults();
      }
    );

    actionButtons.appendChild(saveButton);
    actionButtons.appendChild(cancelButton);
    actionsCell.appendChild(actionButtons);
    actionsCell.appendChild(editError);

  } else {

    const actionButtons =
      document.createElement("div");

    actionButtons.className =
      "row-action-buttons";

    const editButton =
      document.createElement("button");

    editButton.type = "button";
    editButton.className =
      "edit-button edit-icon-button";
    editButton.title = "Изменить";
    editButton.setAttribute(
      "aria-label",
      "Изменить"
    );

    const editIcon =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );

    editIcon.setAttribute("viewBox", "0 0 24 24");
    editIcon.setAttribute("fill", "none");
    editIcon.setAttribute("stroke", "currentColor");
    editIcon.setAttribute("stroke-width", "2");
    editIcon.setAttribute("stroke-linecap", "round");
    editIcon.setAttribute("stroke-linejoin", "round");
    editIcon.setAttribute("aria-hidden", "true");
    editIcon.setAttribute("focusable", "false");

    const editIconPath =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

    editIconPath.setAttribute(
      "d",
      "M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
    );

    editIcon.appendChild(editIconPath);
    editButton.appendChild(editIcon);

    editButton.addEventListener(
      "click",
      async () => {

        editingProductUrl = product.url;

        await renderResults();
      }
    );

    const deleteButton =
      document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className =
      "edit-button edit-icon-button delete-action-button";
    deleteButton.title = "Удалить";
    deleteButton.setAttribute(
      "aria-label",
      "Удалить"
    );
    deleteButton.disabled =
      Boolean(currentUpdateStatus?.running);

    appendActionIcon(
      deleteButton,
      "M6 6l12 12 M18 6L6 18"
    );

    deleteButton.addEventListener(
      "click",
      async () => {

        const productName =
          product.customName || product.name;

        const confirmed = confirm(
          `Удалить «${productName}» из списка?`
        );

        if (!confirmed) {
          return;
        }

        try {

          const result =
            await chrome.storage.local.get([
              "products",
              "updateStatus"
            ]);

          if (result.updateStatus?.running) {
            alert(
              "Нельзя удалять товары во время обновления цен."
            );
            await renderResults();
            return;
          }

          const products =
            result.products || [];

          const productIndex =
            products.findIndex(item =>
              item.url === product.url
            );

          if (productIndex < 0) {
            await renderResults();
            return;
          }

          const updatedProducts =
            [...products];

          updatedProducts.splice(productIndex, 1);

          await chrome.storage.local.set({
            products: updatedProducts
          });

          await renderResults();

        } catch (error) {

          console.error(error);

          alert("Не удалось удалить товар.");
        }
      }
    );

    actionButtons.appendChild(editButton);
    actionButtons.appendChild(deleteButton);
    actionsCell.appendChild(actionButtons);
  }


  row.appendChild(nameCell);
  row.appendChild(currentCell);
  row.appendChild(previousCell);
  row.appendChild(differenceCell);
  row.appendChild(minCell);
  row.appendChild(targetCell);
  row.appendChild(updatedCell);
  row.appendChild(statusCell);
  row.appendChild(actionsCell);

  return row;
}


function appendActionIcon(button, pathData) {

  const icon =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2.5");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const path =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );

  path.setAttribute("d", pathData);
  icon.appendChild(path);
  button.appendChild(icon);
}


function getShortErrorStatus(error) {

  const errorText = String(error);

  if (
    errorText.includes(
      "\u0426\u0435\u043d\u0430 \u043d\u0435 \u043f\u043e\u044f\u0432\u0438\u043b\u0430\u0441\u044c \u0437\u0430 10 \u0441\u0435\u043a\u0443\u043d\u0434"
    )
  ) {
    return "\u0422\u0430\u0439\u043c\u0430\u0443\u0442";
  }

  if (errorText.toLowerCase().includes("\u0446\u0435\u043d")) {
    return "\u0426\u0435\u043d\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430";
  }

  return "\u041e\u0448\u0438\u0431\u043a\u0430";
}


chrome.storage.onChanged.addListener(
  async changes => {

    if (
      changes.products ||
      changes.updateStatus ||
      changes.storeOrder
    ) {
      await renderResults();
    }
  }
);


renderResults();
