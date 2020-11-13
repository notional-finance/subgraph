import {
    ethereum,
    BigInt,
    log,
    BigDecimal,
    Bytes,
    Address
} from "@graphprotocol/graph-ts";
import {
    Account,
    Trade,
    Liquidation,
    Settlement,
    CashMarket
} from "../generated/schema";
import { CashMarket as CashMarketContract } from "../generated/CashMarket/CashMarket";
import { getERC1155Token } from "./contracts";
import { getCashMarket, getSystemConfiguration } from "./common";
import {
    Changes,
    BalanceChange,
    getAccount,
    updateAccount,
    AssetChange
} from "./account";

const DECIMAL_PLACES = 12;

function calculateExchangeRate(
    collateral: BigInt,
    futureCash: BigInt
): BigDecimal {
    return futureCash
        .divDecimal(collateral.toBigDecimal())
        .truncate(DECIMAL_PLACES);
}

function calculateImpliedRate(
    exchangeRate: BigDecimal,
    cashMarketContract: CashMarketContract,
    blocksToMaturity: BigDecimal
): BigDecimal {
    let maturityLength = cashMarketContract.G_MATURITY_LENGTH().toBigDecimal();

    log.debug("Exchange Rate: {}", [exchangeRate.toString()]);
    let impliedRate = exchangeRate
        .minus(BigDecimal.fromString("1"))
        .times(maturityLength)
        .div(blocksToMaturity)
        .truncate(DECIMAL_PLACES);
    log.debug("Implied Rate: {}", [impliedRate.toString()]);

    return impliedRate;
}

function assetTypeToBytes(assetType: string): Bytes {
    if (assetType == "LiquidityToken") {
        return Bytes.fromHexString("0xac") as Bytes;
    } else if (assetType == "CashPayer") {
        return Bytes.fromHexString("0x98") as Bytes;
    } else if (assetType == "CashReceiver") {
        return Bytes.fromHexString("0xa8") as Bytes;
    } else {
        throw new Error("Unknown asset type");
    }
}

export function logTrade(
    event: ethereum.Event,
    cashMarketContractAddress: Address,
    assetType: string,
    notional: BigInt,
    netCashChange: BigInt,
    maturity: i32,
    fee: BigInt,
    account: Account
): string {
    let cashMarketContract = CashMarketContract.bind(cashMarketContractAddress);
    let cashGroupId = cashMarketContract.CASH_GROUP() as i32;

    let erc1155 = getERC1155Token();
    let assetId = erc1155.encodeAssetId(
        cashGroupId,
        0,
        BigInt.fromI32(maturity),
        assetTypeToBytes(assetType)
    );

    let tradeId =
        account.id +
        ":" +
        assetId.toString() +
        ":" +
        event.transaction.hash.toHexString() +
        ":" +
        event.logIndex.toString();
    let trade = new Trade(tradeId);

    trade.blockNumber = event.block.number.toI32();
    trade.blockTimestamp = event.block.timestamp.toI32();
    trade.blockHash = event.block.hash;
    trade.transactionHash = event.transaction.hash;
    trade.gasUsed = event.transaction.gasUsed;
    trade.gasPrice = event.transaction.gasPrice;

    trade.account = account.id;

    trade.assetId = assetId;
    trade.cashGroup = cashGroupId.toString();
    trade.maturity = maturity;
    trade.assetType = assetType;
    trade.notional = notional;
    trade.maturity = maturity;
    trade.fee = fee;

    trade.rate = new BigDecimal(new BigInt(0));
    trade.cashMarket = getCashMarket(cashMarketContractAddress, maturity).id;

    trade.netCashChange = netCashChange;

    if (
        netCashChange.notEqual(BigInt.fromI32(0)) &&
        assetType != "LiquidityToken"
    ) {
        let er = calculateExchangeRate(netCashChange.abs(), notional);
        trade.tradeExchangeRate = er;
        let blocksToMaturity = BigInt.fromI32(maturity)
            .minus(event.block.number)
            .toBigDecimal();
        trade.impliedInterestRate = calculateImpliedRate(
            er,
            cashMarketContract,
            blocksToMaturity
        );
    }
    trade.save();

    log.info("Created trade log for {} and id {}", [assetType, trade.id]);

    return trade.id;
}

export function logLiquidate(
    liquidator: Account,
    liquidatedAccount: Account,
    localCurrencyId: string,
    collateralCurrencyId: string,
    liquidatedAmount: BigInt,
    event: ethereum.Event,
    changes: Changes
): void {
    let id =
        liquidatedAccount.id +
        ":" +
        event.transaction.hash.toHexString() +
        ":" +
        event.logIndex.toString();
    let l = new Liquidation(id);

    l.blockNumber = event.block.number.toI32();
    l.blockTimestamp = event.block.timestamp.toI32();
    l.blockHash = event.block.hash;
    l.transactionHash = event.transaction.hash;
    l.gasUsed = event.transaction.gasUsed;
    l.gasPrice = event.transaction.gasPrice;

    l.liquidator = liquidator.id;
    l.liquidatedAccount = liquidatedAccount.id;
    l.localCurrency = localCurrencyId;
    l.collateralCurrency = collateralCurrencyId;
    l.liquidatedAmount = liquidatedAmount;

    let collateralCurrencyPurchased = findDepositTokenPurchasedAmount(
        collateralCurrencyId,
        changes.balanceChanges
    );
    l.collateralCurrencyPurchased = collateralCurrencyPurchased;
    if (!collateralCurrencyPurchased.isZero()) {
        l.exchangeRate = calculateTokenExchangeRate(
            liquidatedAmount,
            collateralCurrencyPurchased
        );
    }

    let assetsTraded = logAssetsTraded(
        changes.assetChanges,
        event,
        liquidatedAccount
    );
    if (assetsTraded.length > 0) {
        l.assetsTraded = assetsTraded;
    }

    l.save();
    log.info("Created liquidation entity for liquidated account {}", [
        liquidatedAccount.id
    ]);
}

export function logSettled(
    settler: Account,
    payer: Account,
    localCurrencyId: string,
    collateralCurrencyId: string,
    settledAmount: BigInt,
    changes: Changes,
    event: ethereum.Event
): void {
    let id =
        payer.id +
        ":" +
        event.transaction.hash.toHexString() +
        ":" +
        event.logIndex.toString();
    let s = new Settlement(id);

    s.blockNumber = event.block.number.toI32();
    s.blockTimestamp = event.block.timestamp.toI32();
    s.blockHash = event.block.hash;
    s.transactionHash = event.transaction.hash;
    s.gasUsed = event.transaction.gasUsed;
    s.gasPrice = event.transaction.gasPrice;

    s.settleAccount = settler.id;
    s.payerAccount = payer.id;
    s.localCurrency = localCurrencyId;
    s.collateralCurrency = collateralCurrencyId;
    s.settledAmount = settledAmount;

    let collateralCurrencyPurchased = findDepositTokenPurchasedAmount(
        collateralCurrencyId,
        changes.balanceChanges
    );
    s.collateralCurrencyPurchased = collateralCurrencyPurchased;
    if (!collateralCurrencyPurchased.isZero()) {
        s.exchangeRate = calculateTokenExchangeRate(
            settledAmount,
            collateralCurrencyPurchased
        );
    }

    let assetsTraded = logAssetsTraded(changes.assetChanges, event, payer);
    if (assetsTraded.length > 0) {
        s.assetsTraded = assetsTraded;
    }

    s.reserveAccountUsed = wasReserveAccountUsed(event);
    s.save();
    log.info("Created settlement entity for payer {}", [
        payer.id,
    ]);
}

function findDepositTokenPurchasedAmount(
    collateralCurrencyId: string,
    balanceChanges: BalanceChange[]
): BigInt {
    for (let i: i32 = 0; i < balanceChanges.length; i++) {
        if (balanceChanges[i].currencyId == collateralCurrencyId) {
            return balanceChanges[i].cashBalanceChange.neg();
        }
    }

    return BigInt.fromI32(0);
}

function calculateTokenExchangeRate(
    localCurrencyAmount: BigInt,
    collateralCurrencyPurchased: BigInt
): BigDecimal {
    return localCurrencyAmount
        .toBigDecimal()
        .div(collateralCurrencyPurchased.toBigDecimal())
        .truncate(DECIMAL_PLACES);
}

function wasReserveAccountUsed(event: ethereum.Event): bool {
    // We need to update the reserve account as well
    let reserveAddress = getSystemConfiguration().reserveAccount;
    if (reserveAddress != null) {
        let reserveAccount = getAccount(reserveAddress as Address);
        let changes = updateAccount(reserveAccount, event);

        if (changes.balanceChanges.length > 0) return true;
    }

    return false;
}

function logAssetsTraded(
    assetChanges: AssetChange[],
    event: ethereum.Event,
    account: Account
): string[] {
    let assetsTraded = new Array<string>();
    for (let i: i32 = 0; i < assetChanges.length; i++) {
        let cashMarket = CashMarket.load(
            assetChanges[i].cashMarketId
        );
        if (cashMarket == null) {
            throw new Error(
                "Future Cash Market " +
                    assetChanges[i].cashMarketId +
                    " could not be loaded"
            );
        }

        assetsTraded.push(
            logTrade(
                event,
                cashMarket.address as Address,
                assetChanges[i].assetType,
                assetChanges[i].notional,
                assetChanges[i].netCashChange,
                assetChanges[i].maturity,
                BigInt.fromI32(0),
                account
            )
        );
    }

    return assetsTraded;
}
