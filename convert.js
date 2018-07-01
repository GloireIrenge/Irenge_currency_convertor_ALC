const ready = function(fnTest) {

    // if document is already loaded
    if (typeof fnTest !== "function") return;
    if (
      document.readyState === "interactive" ||
      document.readyState === "complete"
    ) {
      return fnTest();
    }
    // or wait until loaded
    document.addEventListener("DOMContentLoaded", fnTest, false);
};

// create IndexedDB
const dbPromise = idb.open("conversionData", 1, upgradeDb => {
    if (!upgradeDb.objectStoreNames.contains("conversionRates")) {
      const rateOS = upgradeDb.createObjectStore("conversionRates", { keyPath: "title" });
      rateOS.createIndex("title", "title");
    }
  
    if (!upgradeDb.objectStoreNames.contains("currenciesList")) {
      upgradeDb.createObjectStore("currenciesList", {
        keyPath: "id",
        autoIncrement: true
      });
    }
});

function app() {
    // sw registration

    if ('serviceWorker' in navigator) {
          window.addEventListener('load', () => {
            navigator.serviceWorker
              .register('./sw.js',{ scope:'./ ' })
              .then(registration => {
                console.log(`Service Worker registered! Scope: ${registration.scope}`);
              })
              .catch(err => {
                console.log(`failed to register the service worker: ${err}`);
              });
          });
    }
    // get & set list of currencies
    getCurrencies()
      .then(currencies => {
        setCurrencies(currencies);
      })
      .catch(err => {
        console.log(err);
    });
}


//response log
function setErrorMessage() {
    const messageP = document.querySelector("#error-message");
    messageP.innerHTML = "Please, check your connection!";
  
    setTimeout(() => {
      messageP.innerHTML = "";
    }, 5000);
}
function respondJson(response) {
    if (!response.ok) {
      throw Error(response.statusText);
    }
    return response.json();
}

function getCurrencies() {
  return dbPromise
  .then(db => {
    if (!db) return;
  
    const tx = db.transaction("currenciesList", "readonly");
    const store = tx.objectStore("currenciesList");
    return store.getAll();
  })
    .then(results => {
    if (results.length === 0) {
      console.log("fetching currencies list");
      return fetchCurrencies();
    }
    console.log("using currencies list from idb");
    return results[0].list;
  })
  .catch(err => {
    console.log(err);
    setErrorMessage();
  });
}

// get list of currencies from API
function fetchCurrencies() {
  const url = "https://free.currencyconverterapi.com/api/v5/currencies";
  const listCurrRequest = new Request(url);
  
  if (!("fetch" in window)) {
    console.log("Fetch API not found");
    return;
  }
  
  return fetch(listCurrRequest)
    .then(response => {
      return respondJson(response);
    })
    .then(resJson => {
      const currencies = formatCurrencies(resJson.results);
      saveCurrencies(currencies);
      return currencies;
    })
    .catch(err => {
      console.log(err);
    });
}

// format currencies as array of objects and shorten long currency names
function formatCurrencies(currObject) {
  let currencies = [];
  const currKeys = Object.keys(currObject).sort();
  for (key of currKeys) {
    const { currencyName: name } = currObject[key];
    const currencyName =
      name.length > 23 ? `${name.substring(0, 23)}...` : name;
    currencies.push({ id: key.toUpperCase(), currencyName });
  }
  return currencies;
}

// save array of currencies to indexedDB
function saveCurrencies(currArray) {
  dbPromise
    .then(db => {
      if (!db) return;

      const tx = db.transaction("currenciesList", "readwrite");
      const store = tx.objectStore("currenciesList");
      const item = { list: currArray };
      store.add(item);
      return tx.complete;
    })
    .then(() => {
      console.log(`currencies list saved to db`);
    })
    .catch(err => {
      console.log(err);
    });
}

// create options for every currency and append it to <select>
function setCurrencies(currArray) {
  const decoyee = document.createDocumentFragment(),
  select1 = document.getElementById('currency1'),
  select2 = document.getElementById('currency2');
  
  currArray.forEach(elem => {
    const option = document.createElement("option"),
      optionValue = elem.id;
      option.innerHTML = `${elem.currencyName} - ${elem.id}`;
      option.setAttribute("value", optionValue);
      decoyee.appendChild(option);
  });
  
  const decoyer = decoyee.cloneNode(true);
  select1.appendChild(decoyee);
  select2.appendChild(decoyer);
}

function getRate(frrom, too) {
  // check if the rate is in db & fresh (stored < 120 min ago)
  // if found & fresh -> use it
  // if not -> fetch the rate and save to DB.
  return dbPromise
    .then(db => {
      if (!db) return;
  
      const tx = db.transaction("conversionRates", "readonly"),
            frrom = document.getElementById('currency1').value,
            too = document.getElementById('currency2').value,
        index = tx.objectStore("conversionRates").index("title");
        console.log(frrom);
      return index.get(`${frrom}_${too}`);
    })
    .then(value => {
      if (value && checkLastUpdate(value)) {
        console.log("The rate is current");
        return value;
      }
      console.log("No rate or it's expired");
      return getExchangeRatesFromAPI(frrom, too);
    })
    .catch(err => {
      console.log(err);
    });
}

function convert() {
    
    const amount1 = document.getElementById('amount1').value,
    frrom = document.getElementById('currency1').value,
            too = document.getElementById('currency2').value,
            amount2 = document.getElementById('amount2');
    getRate(frrom, too)
      .then(result => {
        // calculate & set the result
        console.log(result.value);
        const converted = result.value * amount1;
        amount2.value = converted;
      })
      .catch(err => {
        console.log(err);
      });
}

// checks whether the rate was updated less than 2 hours ago
function checkLastUpdate(val) {
  const interval = 2 * 60 * 60 * 1000;
  const trustedInterval = val.timeStamp.getTime() + interval;
  return trustedInterval > Date.now();
}

function getExchangeRatesFromAPI(frrom, too) {
  frrom = encodeURIComponent(frrom);
  too = encodeURIComponent(too);
  const query = `${frrom}_${too}`,
    url = `https://free.currencyconverterapi.com/api/v5/convert?q=${query}`,
    rateRequest = new Request(url);
  
  if (!("fetch" in window)) {
    console.log("Fetch API not found");
    return;
  }
  
  return fetch(rateRequest)
    .then(response => {
      return respondJson(response);
    })
    .then(jsonResponse => {
      const { results } = jsonResponse;
      const rates = flattenExchangeRates(results, frrom, too);
  
      saveExchangeRates(rates);
      return rates[0];
    })
    .catch(err => {
      console.log(err);
      // set message about connection
      setErrorMessage();
    });
}

function saveExchangeRates(ratesArr) {
  dbPromise
    .then(db => {
      if (!db) return;
  
      const tx = db.transaction("conversionRates", "readwrite");
      const store = tx.objectStore("conversionRates");
      const [item] = ratesArr;
  
      store.put(item);
      return tx.complete;
    })
    .then(() => {
      console.log(`conversion rate saved to db`);
    })
    .catch(err => {
      console.log(err);
    });
}

function flattenExchangeRates(rateObj, from, to) {
  const rate = `${from}_${to}`;
  const { [rate]: from_To } = rateObj;
  //flatten records and add timestamp
  const item1 = { title: rate, value: from_To.val, timeStamp: new Date() }
  return [item1];
}

function switchcurrency() {
  const temp = document.getElementById('currency1').value;
  document.getElementById('currency1').value = document.getElementById('currency2').value;
  document.getElementById('currency2').value = temp;
}
  
// starting the application
ready(app);