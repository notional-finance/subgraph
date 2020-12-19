import { AddLiquidity, RemoveLiquidity, TakeCurrentCash, TakefCash, CashMarket as CashMarketContract, UpdateRateFactors, UpdateMaxTradeSize, UpdateFees } from "../generated/CashMarket/CashMarket";
import { getCashGroup,getCashMarket, updateCashMarket } from "./common";
import { log, BigInt, Address } from "@graphprotocol/graph-ts";
import { getAccount, updateAccount } from "./account";
import { logTrade } from "./historical";

export function handleAddLiquidity(event: AddLiquidity): void {
  let account = getAccount(event.params.account);
  updateAccount(account, event);

  let cashMarket = getCashMarket(event.address, event.params.maturity.toI32());
  updateCashMarket(cashMarket, event);

  let fee = BigInt.fromI32(0);
  logTrade(
    event,
    cashMarket.address as Address,
    "LiquidityToken",
    event.params.tokens,
    event.params.cash.neg(),
    event.params.maturity.toI32(),
    fee,
    account
  );

  logTrade(
    event,
    cashMarket.address as Address,
    "CashPayer",
    event.params.fCash,
    new BigInt(0),
    event.params.maturity.toI32(),
    fee,
    account
  );

  log.info("Handled adding liquidity for account {}", [account.id]);
}

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
  let account = getAccount(event.params.account);
  updateAccount(account, event);

  let cashMarket = getCashMarket(event.address, event.params.maturity.toI32());
  updateCashMarket(cashMarket, event);

  let fee = BigInt.fromI32(0);
  logTrade(
    event,
    cashMarket.address as Address,
    "LiquidityToken",
    event.params.tokens.neg(),
    event.params.cash,
    event.params.maturity.toI32(),
    fee,
    account
  );

  logTrade(
    event,
    cashMarket.address as Address,
    "CashReceiver",
    event.params.fCash,
    new BigInt(0),
    event.params.maturity.toI32(),
    fee,
    account
  );

  log.info("Handled remove liquidity for account {}", [account.id]);
}

export function handleTakeCurrentCash(event: TakeCurrentCash): void {
  let account = getAccount(event.params.account);
  updateAccount(account, event);

  let cashMarket = getCashMarket(event.address, event.params.maturity.toI32());
  updateCashMarket(cashMarket, event);

  logTrade(
    event,
    cashMarket.address as Address,
    "CashPayer",
    event.params.fCash,
    event.params.cash,
    event.params.maturity.toI32(),
    event.params.fee,
    account
  );

  log.info("Handled take collateral for account {}", [account.id]);
}

export function handleTakefCash(event: TakefCash): void {
  let account = getAccount(event.params.account);
  updateAccount(account, event);

  let cashMarket = getCashMarket(event.address, event.params.maturity.toI32());
  updateCashMarket(cashMarket, event);

  logTrade(
    event,
    cashMarket.address as Address,
    "CashReceiver",
    event.params.fCash,
    event.params.cash.neg(),
    event.params.maturity.toI32(),
    event.params.fee,
    account
  );

  log.info("Handled take future cash for account {}", [account.id]);
}

export function handleRateFactors(event: UpdateRateFactors): void {
  let cashMarketContract = CashMarketContract.bind(event.address);
  let cashGroupId = cashMarketContract.CASH_GROUP() as i32;
  // If cash group is not set then exit
  if (cashGroupId == 0) return;

  let cashGroup = getCashGroup(cashGroupId.toString());
  let rateAnchor = event.params.rateAnchor.toI32();
  let rateScalar = event.params.rateScalar;
  
  let isUpdated = false;
  if (cashGroup.rateAnchor != rateAnchor) {
    cashGroup.rateAnchor = rateAnchor;
    isUpdated = true;
  }

  if (cashGroup.rateScalar != rateScalar) {
    cashGroup.rateScalar = rateScalar;
    isUpdated = true;
  }

  if (isUpdated) {
    cashGroup.lastUpdateBlockNumber = event.block.number.toI32();
    cashGroup.lastUpdateTimestamp = event.block.timestamp.toI32();
    cashGroup.lastUpdateBlockHash = event.block.hash;
    cashGroup.lastUpdateTransactionHash = event.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [cashGroup.id]);
    cashGroup.save();
    log.info("Updated rate factors on future cash group {}", [cashGroup.id]);
  }
}

export function handleMaxTradeSize(event: UpdateMaxTradeSize): void {
  let cashMarketContract = CashMarketContract.bind(event.address);
  let cashGroupId = cashMarketContract.CASH_GROUP() as i32;
  // If cash group is not set then exit, this is due to setting parameters
  // on a contract before setting it in the portfolio
  if (cashGroupId == 0) return;

  let cashGroup = getCashGroup(cashGroupId.toString());
  let maxTradeSize = event.params.maxTradeSize;
  
  let isUpdated = false;
  if (cashGroup.maxTradeSize != maxTradeSize) {
    cashGroup.maxTradeSize = maxTradeSize
    isUpdated = true;
  }

  if (isUpdated) {
    cashGroup.lastUpdateBlockNumber = event.block.number.toI32();
    cashGroup.lastUpdateTimestamp = event.block.timestamp.toI32();
    cashGroup.lastUpdateBlockHash = event.block.hash;
    cashGroup.lastUpdateTransactionHash = event.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [cashGroup.id]);
    cashGroup.save();
    log.info("Updated max trade size on future cash group {}", [cashGroup.id]);
  }
}

export function handleFees(event: UpdateFees): void {
  let cashMarketContract = CashMarketContract.bind(event.address);
  let cashGroupId = cashMarketContract.CASH_GROUP() as i32;
  // If cash group is not set then exit, this is due to setting parameters
  // on a contract before setting it in the portfolio
  if (cashGroupId == 0) return;

  let cashGroup = getCashGroup(cashGroupId.toString());
  let liquidityFee = event.params.liquidityFee.toI32();
  let transactionFee = event.params.transactionFee;
  
  let isUpdated = false;
  if (cashGroup.liquidityFee != liquidityFee) {
    cashGroup.liquidityFee = liquidityFee;
    isUpdated = true;
  }

  if (cashGroup.transactionFee != null && cashGroup.transactionFee.notEqual(transactionFee)) {
    cashGroup.transactionFee = transactionFee;
    isUpdated = true;
  }

  if (isUpdated) {
    cashGroup.lastUpdateBlockNumber = event.block.number.toI32();
    cashGroup.lastUpdateTimestamp = event.block.timestamp.toI32();
    cashGroup.lastUpdateBlockHash = event.block.hash;
    cashGroup.lastUpdateTransactionHash = event.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [cashGroup.id]);
    cashGroup.save();
    log.info("Updated fees on future cash group {}", [cashGroup.id]);
  }
}