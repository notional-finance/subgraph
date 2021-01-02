import { CurrencyBalance, Currency, ExchangeRate, SystemConfiguration, CashGroup, CashMarket } from "../generated/schema";
import { log, Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { CashMarket as CashMarketContract } from "../generated/CashMarket/CashMarket";
import { getEscrow, getPortfolios } from "./contracts";

export function getCurrencyBalance(account: Address, currencyId: string): CurrencyBalance {
  let id = account.toHexString() + ":" + currencyId;
  log.debug("Retrieving currency balance entity {}", [id]);

  let entity = CurrencyBalance.load(id);
  if (entity == null) {
    entity = new CurrencyBalance(id);
    entity.currency = currencyId;
    entity.cashBalance = BigInt.fromI32(0);
  }

  return entity as CurrencyBalance;
}

export function updateCurrencyBalance(balance: CurrencyBalance, data: ethereum.Event): string {
  let account = balance.id.split(":", 1)[0];
  let accountAddress = Address.fromString(account);

  let escrowContract = getEscrow();
  let currencyId = parseI32(balance.currency);
  balance.cashBalance = escrowContract.cashBalances(currencyId, accountAddress);

  balance.lastUpdateBlockNumber = data.block.number.toI32();
  balance.lastUpdateTimestamp = data.block.timestamp.toI32();
  balance.lastUpdateBlockHash = data.block.hash;
  balance.lastUpdateTransactionHash = data.transaction.hash;
  log.debug("Updated transaction variables for entity {}", [balance.id]);
  balance.save();
  log.debug("Updated currency balance entity {} with value {}", [balance.id, balance.cashBalance.toString()]);

  return balance.id;
}


export function getCashMarket(address: Address, maturity: i32): CashMarket {
  let maturityString = maturity.toString();
  let cashMarketContract = CashMarketContract.bind(address as Address);
  let cashGroupId = cashMarketContract.CASH_GROUP() as i32;
  let cashGroupString = cashGroupId.toString();

  let id = cashGroupString + ":" + maturityString;
  let entity = CashMarket.load(id);
  if (entity == null) {
    entity = new CashMarket(id);
    // We set this value here so that its accessible later
    entity.address = address;
    entity.maturity = maturity;
  }

  return entity as CashMarket;
}

export function updateCashMarket(cashMarket: CashMarket, data: ethereum.Event): string {
  let cashMarketContract = CashMarketContract.bind(cashMarket.address as Address);
  let marketData = cashMarketContract.getMarket(BigInt.fromI32(cashMarket.maturity));

  cashMarket.totalfCash = marketData.totalfCash;
  cashMarket.totalLiquidity = marketData.totalLiquidity;
  cashMarket.totalCurrentCash = marketData.totalCurrentCash;
  cashMarket.rateScalar = marketData.rateScalar;
  cashMarket.rateAnchor = marketData.rateAnchor.toI32();
  cashMarket.lastImpliedRate = marketData.lastImpliedRate.toI32();

  cashMarket.lastUpdateBlockNumber = data.block.number.toI32();
  cashMarket.lastUpdateTimestamp = data.block.timestamp.toI32();
  cashMarket.lastUpdateBlockHash = data.block.hash;
  cashMarket.lastUpdateTransactionHash = data.transaction.hash;
  log.debug("Updated transaction variables for entity {}", [cashMarket.id]);
  cashMarket.save();
  log.debug("Updated future cash market entity {}", [cashMarket.id]);

  // Add the market to the future cash group list
  let cashGroupId = cashMarketContract.CASH_GROUP() as i32;
  let cashGroup = getCashGroup(cashGroupId.toString())
  let markets = cashGroup.cashMarkets;
  let found = false;
  for (let i = 0; i < markets.length; i++) {
    if (markets[i] as string == cashMarket.id) {
      found = true;
      break;
    }
  }

  if (!found) {
    markets.push(cashMarket.id);
    cashGroup.cashMarkets = markets;
    cashGroup.save();
  }

  return cashMarket.id;
}

// These are system parameter objects
export function getCurrency(id: string): Currency {
  log.debug("Retrieving currency entity {}", [id]);

  let entity = Currency.load(id);
  if (entity == null) {
    entity = new Currency(id);
  }
  return entity as Currency;
}

export function getExchangeRate(base: Currency, quote: Currency): ExchangeRate {
  let id = base.id + ":" + quote.id;
  let entity = ExchangeRate.load(id);
  if (entity == null) {
    entity = new ExchangeRate(id);
  }
  return entity as ExchangeRate;
}

export function getCashGroup(id: string): CashGroup {
  let entity = CashGroup.load(id);
  if (entity == null) {
    entity = new CashGroup(id);
    entity.cashMarkets = [];
  }
  return entity as CashGroup;
}

export function updateCashGroup(cashGroupId: string, data: ethereum.Event): string {
  let portfoliosContract = getPortfolios();
  let cashGroup = getCashGroup(cashGroupId);
  let id = I32.parseInt(cashGroup.id);
  let cgData = portfoliosContract.getCashGroup(id);

  cashGroup.numMaturities = cgData.numMaturities.toI32();
  cashGroup.maturityLength = cgData.maturityLength.toI32();
  cashGroup.ratePrecision = cgData.precision;
  let currency = cgData.currency as i32;
  cashGroup.currency = currency.toString();

  // Check if the contract is set
  if (cgData.cashMarket != Address.fromHexString("0x0000000000000000000000000000000000000000")) {
    cashGroup.isIdiosyncratic = false;
    cashGroup.cashMarketContract = cgData.cashMarket;

    let cashMarketContract = CashMarketContract.bind(Address.fromHexString(cashGroup.cashMarketContract.toHexString()) as Address);
    cashGroup.rateAnchor = cashMarketContract.G_RATE_ANCHOR().toI32();
    cashGroup.rateScalar = cashMarketContract.G_RATE_SCALAR();
    cashGroup.liquidityFee = cashMarketContract.G_LIQUIDITY_FEE().toI32();
    cashGroup.transactionFee = cashMarketContract.G_TRANSACTION_FEE();
    cashGroup.maxTradeSize = cashMarketContract.G_MAX_TRADE_SIZE();

    // These markets will be initialized as liquidity is added to them.
    if (cashGroup.cashMarkets == null) {
      cashGroup.cashMarkets = new Array<string>();
    }
  } else {
    cashGroup.isIdiosyncratic = true;
  }

  cashGroup.lastUpdateBlockNumber = data.block.number.toI32();
  cashGroup.lastUpdateTimestamp = data.block.timestamp.toI32();
  cashGroup.lastUpdateBlockHash = data.block.hash;
  cashGroup.lastUpdateTransactionHash = data.transaction.hash;
  log.debug("Updated transaction variables for entity {}", [cashGroup.id]);
  cashGroup.save();
  log.info("Updated future cash group entity {}", [cashGroup.id]);

  return cashGroup.id;
}

export function getSystemConfiguration(): SystemConfiguration {
  const id = "0";
  log.debug("Retrieving system configuration entity {}", [id]);
  let entity = SystemConfiguration.load(id);
  if (entity == null) {
    entity = new SystemConfiguration(id);
  }
  return entity as SystemConfiguration;
}
