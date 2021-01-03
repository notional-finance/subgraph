import { SetDiscounts, SetReserve, Escrow, NewCurrency, UpdateExchangeRate, Deposit as DepositEvent, Withdraw as WithdrawEvent} from "../generated/Escrow/Escrow";
import { getSystemConfiguration, getCurrency, getExchangeRate } from "./common";
import { Address, log } from "@graphprotocol/graph-ts";
import { ERC20 } from "../generated/Escrow/ERC20";
import { IAggregator } from "../generated/PriceOracle/IAggregator";
import { getAccount, updateAccount } from "./account";
import { Withdraw, Deposit } from "../generated/schema";
import { getRateValue, setPriceOracle, setRateValue } from "./exchangeRate";

export function updateDiscounts(event: SetDiscounts): void {
  let systemConfiguration = getSystemConfiguration();
  let settlementDiscount = event.params.settlementDiscount;
  let repoIncentive = event.params.repoIncentive;

  let isUpdated = false;
  if (systemConfiguration.liquidityRepoIncentive != repoIncentive) {
    systemConfiguration.liquidityRepoIncentive = repoIncentive;
    isUpdated = true;
  }

  if (systemConfiguration.settlementDiscount != settlementDiscount) {
    systemConfiguration.settlementDiscount = settlementDiscount;
    isUpdated = true;
  }

  if (isUpdated) {
    systemConfiguration.lastUpdateBlockNumber = event.block.number.toI32();
    systemConfiguration.lastUpdateTimestamp = event.block.timestamp.toI32();
    systemConfiguration.lastUpdateBlockHash = event.block.hash;
    systemConfiguration.lastUpdateTransactionHash = event.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [systemConfiguration.id]);
    systemConfiguration.save();
    log.info("Updated discounts in system parameters", []);
  }
}

export function updateReserveAccount(event: SetReserve): void {
  let systemConfiguration = getSystemConfiguration();
  let reserveAccount = event.params.reserveAccount;

  // Need to check that the parameters have actually changed in the contract.
  if (systemConfiguration.reserveAccount == null ||
      systemConfiguration.reserveAccount.notEqual(reserveAccount)) {
    systemConfiguration.reserveAccount = reserveAccount;

    systemConfiguration.lastUpdateBlockNumber = event.block.number.toI32();
    systemConfiguration.lastUpdateTimestamp = event.block.timestamp.toI32();
    systemConfiguration.lastUpdateBlockHash = event.block.hash;
    systemConfiguration.lastUpdateTransactionHash = event.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [systemConfiguration.id]);
    systemConfiguration.save();
    log.info("Updated reserve account in system parameters", []);
  }
}

export function handleNewCurrency(event: NewCurrency): void {
  let escrowContract = Escrow.bind(event.address);
  let token = event.params.token;
  let currencyId = escrowContract.addressToCurrencyId(token) as i32;
  let decimals = escrowContract.currencyIdToDecimals(currencyId);
  let options = escrowContract.tokenOptions(token);
  let currency = getCurrency(currencyId.toString());

  log.debug("New token listed at address {}", [token.toHexString()]);
  let erc20 = ERC20.bind(token);
  let name = erc20.try_name();
  if (name.reverted) {
    currency.name = "unknown";
  } else {
    currency.name = name.value;
  }

  let symbol = erc20.try_symbol();
  if (name.reverted) {
    currency.symbol = "";
  } else {
    currency.symbol = symbol.value;
  }

  currency.tokenAddress = token;
  currency.decimals = decimals;
  currency.isERC777 = options.value0;
  currency.hasTransferFee = options.value1;

  currency.lastUpdateBlockNumber = event.block.number.toI32();
  currency.lastUpdateTimestamp = event.block.timestamp.toI32();
  currency.lastUpdateBlockHash = event.block.hash;
  currency.lastUpdateTransactionHash = event.transaction.hash;
  log.debug("Updated transaction variables for entity {}", [currency.id]);
  currency.save();
  log.info("Created new currency entity {}", [currency.id]);
}

export function handleUpdateExchangeRate(event: UpdateExchangeRate): void {
  let escrowContract = Escrow.bind(event.address);

  let baseId = event.params.base as i32;
  let baseCurrency = getCurrency(baseId.toString());

  let quoteId = event.params.quote as i32;
  let quoteCurrency = getCurrency(quoteId.toString());

  log.debug("Fetched base and quote currencies", []);
  let exchangeRate = getExchangeRate(baseCurrency, quoteCurrency);
  exchangeRate.baseCurrency = baseCurrency.id;
  exchangeRate.quoteCurrency = quoteCurrency.id;

  log.debug("Fetched exchange rate", []);
  let erData = escrowContract.getExchangeRate(baseId, quoteId);
  exchangeRate.rateOracle = erData.rateOracle;
  exchangeRate.buffer = erData.buffer;
  exchangeRate.rateDecimals = erData.rateDecimals;
  exchangeRate.mustInvert = erData.mustInvert;
  exchangeRate.haircut = erData.haircut;
  exchangeRate.liquidationDiscount = erData.liquidationDiscount;

  // Set the price oracle entity for later retrieval
  setPriceOracle(exchangeRate.id, erData.rateOracle);

  if (erData.rateOracle != Address.fromHexString("0x0000000000000000000000000000000000000000")) {
    // We set the latest rate immediately so that it is available.
    let oracle = IAggregator.bind(erData.rateOracle as Address);
    let answer = oracle.latestAnswer();
    let rateValue = getRateValue(exchangeRate.id)
    setRateValue(rateValue, answer, event);
    exchangeRate.latestRate = rateValue.id;
  } else {
    // If the rate oracle is not set then we assume the exchange rate to be 1-1 with decimals. This will
    // be the case for ETH-Wrapped Eth for example.
    let rateValue = getRateValue(exchangeRate.id)
    setRateValue(rateValue, erData.rateDecimals, event);
    exchangeRate.latestRate = rateValue.id;
  }

  exchangeRate.lastUpdateBlockNumber = event.block.number.toI32();
  exchangeRate.lastUpdateTimestamp = event.block.timestamp.toI32();
  exchangeRate.lastUpdateBlockHash = event.block.hash;
  exchangeRate.lastUpdateTransactionHash = event.transaction.hash;
  log.debug("Updated transaction variables for entity {}", [exchangeRate.id]);
  exchangeRate.save();
  log.info("Created new exchange rate entity {}", [exchangeRate.id]);
}

export function handleDeposit(event: DepositEvent): void {
  let account = getAccount(event.params.account);
  updateAccount(account, event);
  log.info("Updated account entity {} for deposit", [account.id]);

  let currencyId = event.params.currency as i32;
  let depositId = account.id + ":" + currencyId.toString() + ":" + event.transaction.hash.toHexString() + ":" + event.logIndex.toString();
  let deposit = new Deposit(depositId);

  deposit.blockNumber = event.block.number.toI32();
  deposit.blockTimestamp = event.block.timestamp.toI32();
  deposit.blockHash = event.block.hash;
  deposit.transactionHash = event.transaction.hash;
  deposit.gasUsed = event.transaction.gasUsed;
  deposit.gasPrice = event.transaction.gasPrice;

  deposit.account = account.id;
  deposit.currency = currencyId.toString();
  deposit.amount = event.params.value;
  deposit.save();

  log.info("Logging a deposit entity {} for account {}", [deposit.id, account.id]);
}

export function handleWithdraw(event: WithdrawEvent): void {
  let account = getAccount(event.params.account);
  updateAccount(account, event);
  log.info("Updated account entity {} for withdraw", [account.id]);

  let currencyId = event.params.currency as i32;
  let withdrawId = account.id + ":" + currencyId.toString() + ":" + event.transaction.hash.toHexString() + ":" + event.logIndex.toString();
  let withdraw = new Withdraw(withdrawId);

  withdraw.blockNumber = event.block.number.toI32();
  withdraw.blockTimestamp = event.block.timestamp.toI32();
  withdraw.blockHash = event.block.hash;
  withdraw.transactionHash = event.transaction.hash;
  withdraw.gasUsed = event.transaction.gasUsed;
  withdraw.gasPrice = event.transaction.gasPrice;

  withdraw.account = account.id;
  withdraw.currency = currencyId.toString();
  withdraw.amount = event.params.value;
  withdraw.save();

  log.info("Logging a withdraw entity {} for account {}", [withdraw.id, account.id]);
}