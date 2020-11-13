import { Liquidate, LiquidateBatch, SettleCash, SettleCashBatch } from "../generated/Escrow/Escrow";
import { updateCashMarket } from "./common";
import { ethereum, log } from "@graphprotocol/graph-ts";
import { getAccount, updateAccount, Changes } from "./account";
import { CashMarket, Account } from "../generated/schema";
import { logLiquidate, logSettled } from "./historical";

export function handleLiquidate(event: Liquidate): void {
  let liquidator = getAccount(event.transaction.from);
  updateAccount(liquidator, event);

  let liquidatedAccount = getAccount(event.params.account);
  let changes = updateLiquidatedOrSettled(liquidatedAccount, event);

  let localCurrency = event.params.localCurrency as i32;
  let collateralCurrency = event.params.collateralCurrency as i32;

  logLiquidate(
    liquidator,
    liquidatedAccount,
    localCurrency.toString(),
    collateralCurrency.toString(),
    event.params.amountRecollateralized,
    event,
    changes
  );
}

export function handleLiquidateBatch(event: LiquidateBatch): void {
  let liquidator = getAccount(event.transaction.from);
  updateAccount(liquidator, event);
  let localCurrency = event.params.localCurrency as i32;
  let collateralCurrency = event.params.collateralCurrency as i32;

  let liquidated = event.params.accounts;
  let amountRecollateralized = event.params.amountRecollateralized;
  for (let i: i32 = 0; i < liquidated.length; i++) {
    let liquidatedAccount = getAccount(liquidated[i]);
    let changes = updateLiquidatedOrSettled(liquidatedAccount, event);

    logLiquidate(
      liquidator,
      liquidatedAccount,
      localCurrency.toString(),
      collateralCurrency.toString(),
      amountRecollateralized[i],
      event,
      changes
    );
  }
}

export function handleSettleCash(event: SettleCash): void {
  let settler = getAccount(event.transaction.from);
  updateAccount(settler, event);

  let localCurrency = event.params.localCurrency as i32;
  let collateralCurrency = event.params.collateralCurrency as i32;
  let localCurrencyId = localCurrency.toString();
  let collateralCurrencyId = collateralCurrency.toString();

  let payer = getAccount(event.params.payer);
  let changes = updateLiquidatedOrSettled(payer, event);

  logSettled(
    settler,
    payer,
    localCurrencyId,
    collateralCurrencyId,
    event.params.settledAmount,
    changes,
    event
  );
}

export function handleSettleCashBatch(event: SettleCashBatch): void {
  let settler = getAccount(event.transaction.from);
  updateAccount(settler, event);

  let localCurrency = event.params.localCurrency as i32;
  let collateralCurrency = event.params.collateralCurrency as i32;

  let payers = event.params.payers;
  let settledAmounts = event.params.settledAmounts;

  for (let i: i32 = 0; i < payers.length; i++) {
    let payer = getAccount(payers[i]);
    let changes = updateLiquidatedOrSettled(payer, event);
    // TODO: This wont work if a single payer has been settled twice in a transaction since
    // we wont be able to calculate the correct deposit currency transfer amount.
    logSettled(
      settler,
      payer,
      localCurrency.toString(),
      collateralCurrency.toString(),
      settledAmounts[i],
      changes,
      event
    );
  }
}

function updateLiquidatedOrSettled(account: Account, event: ethereum.Event): Changes {
  log.debug("Updating liquidated account {}", [account.id]);
  let changes = updateAccount(account, event);

  let assetChanges = changes.assetChanges;
  for (let i: i32 = 0; i < assetChanges.length; i++) {
    let fcm = CashMarket.load(assetChanges[i].cashMarketId);
    if (fcm == null) {
      throw new Error("Future cash market " + assetChanges[i].cashMarketId + " could not be loaded");
    }
    updateCashMarket(fcm as CashMarket, event);
  }

  return changes;
}

