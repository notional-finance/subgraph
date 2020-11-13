import {
    log,
    Address,
    ethereum,
    Bytes,
    BigInt,
    store
} from "@graphprotocol/graph-ts";
import { Account, Asset } from "../generated/schema";
import { getEscrow, getPortfolios, getERC1155Token } from "./contracts";
import { Portfolios__getAssetResultValue0Struct } from "../generated/Portfolios/Portfolios";
import {
    getCurrencyBalance,
    updateCurrencyBalance,
    getCashGroup,
    getCashMarket
} from "./common";

type AssetStruct = Portfolios__getAssetResultValue0Struct;

export class BalanceChange {
    currencyBalanceId: string;
    currencyId: string;
    cashBalanceChange: BigInt;

    constructor(
        currencyBalanceId: string,
        currencyId: string,
        cashBalanceChange: BigInt
    ) {
        this.currencyBalanceId = currencyBalanceId;
        this.currencyId = currencyId;
        this.cashBalanceChange = cashBalanceChange;
    }
}

export class AssetChange {
    id: string;
    cashMarketId: string;
    assetType: string;
    maturity: i32;
    notional: BigInt;
    netCashChange: BigInt;

    constructor(
        id: string,
        cashMarketId: string,
        assetType: string,
        maturity: i32,
        notional: BigInt,
        netCashChange: BigInt
    ) {
        this.id = id;
        this.cashMarketId = cashMarketId;
        this.assetType = assetType;
        this.maturity = maturity;
        this.notional = notional;
        this.netCashChange = netCashChange;
    }
}

export class Changes {
    assetChanges: AssetChange[];
    balanceChanges: BalanceChange[];

    constructor(assetChanges: AssetChange[], balanceChanges: BalanceChange[]) {
        this.assetChanges = assetChanges;
        this.balanceChanges = balanceChanges;
    }
}

export function formatAssetType(assetType: Bytes): string {
    let hexAssetType = assetType.toHexString();
    if (hexAssetType == "0xac") {
        return "LiquidityToken";
    } else if (hexAssetType == "0x98") {
        return "CashPayer";
    } else if (hexAssetType == "0xa8") {
        return "CashReceiver";
    } else {
        throw new Error("Unknown asset type");
    }
}

export function getAccount(account: Address): Account {
    let id = account.toHexString();
    log.debug("Retrieving account entity {}", [id]);

    let entity = Account.load(id);
    if (entity == null) {
        entity = new Account(id);
        entity.balances = new Array<string>();
        entity.portfolio = new Array<string>();
    }
    return entity as Account;
}

/**
 * Will do a complete update of all balances and assets in the portfolio.
 *
 * @param account
 * @param data
 */
export function updateAccount(account: Account, data: ethereum.Event): Changes {
    let balanceChanges = updateBalances(account, data);
    let assetChanges = updatePortfolio(account, data);

    account.lastUpdateBlockNumber = data.block.number.toI32();
    account.lastUpdateTimestamp = data.block.timestamp.toI32();
    account.lastUpdateBlockHash = data.block.hash;
    account.lastUpdateTransactionHash = data.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [account.id]);
    account.save();
    log.debug("Updated account entity {}", [account.id]);

    return new Changes(assetChanges, balanceChanges);
}

function updateBalances(
    account: Account,
    data: ethereum.Event
): BalanceChange[] {
    let accountAddress = Address.fromHexString(account.id) as Address;
    let maxCurrencyId = getEscrow().maxCurrencyId();
    let balancesDiff = new Array<BalanceChange>();
    let balances = new Array<string>();

    for (let i = 0; i <= maxCurrencyId; i++) {
        let balance = getCurrencyBalance(accountAddress, i.toString());
        let cashBalanceBefore = balance.cashBalance;

        updateCurrencyBalance(balance, data);

        // Check difference before and after balances
        if (balance.cashBalance.notEqual(cashBalanceBefore)) {
            balancesDiff.push(
                new BalanceChange(
                    balance.id,
                    balance.currency,
                    balance.cashBalance.minus(cashBalanceBefore)
                )
            );
        }

        // Only list balances on the account that are non zero
        if (balance.cashBalance.isZero()) {
            log.debug("Removing currency balance entity {}", [balance.id]);
            store.remove("CurrencyBalance", balance.id);
        } else {
            log.debug("Pushing currency balance entity {}", [balance.id]);
            balances.push(balance.id);
        }
    }

    account.balances = balances;

    return balancesDiff;
}

function updatePortfolio(
    account: Account,
    data: ethereum.Event
): AssetChange[] {
    let accountAddress = Address.fromHexString(account.id) as Address;
    let portfolioContract = getPortfolios();
    let assetsBefore = new Array<Asset>();
    let ids = account.portfolio;

    for (let i: i32 = 0; i < account.portfolio.length; i++) {
        let a = Asset.load(ids[i]);
        if (a == null) {
            throw new Error("Asset " + account.portfolio[i] + " not found");
        }
        assetsBefore.push(a as Asset);
    }

    let assets = new Array<string>();
    for (let i: i32 = 0; true; i++) {
        let result = portfolioContract.try_getAsset(
            accountAddress,
            BigInt.fromI32(i)
        );
        if (result.reverted) {
            break;
        } else {
            let asset = getAsset(accountAddress, result.value);
            assets.push(updateAsset(asset, result.value, data));
        }
    }

    account.portfolio = assets;
    return findAssetChanges(assetsBefore, assets, data.block.number.toI32());
}

function makeAssetRemoval(asset: Asset): AssetChange {
    if (asset.assetType == "LiquidityToken") {
        return new AssetChange(
            asset.id,
            asset.cashMarket as string,
            asset.assetType,
            asset.maturity,
            asset.notional.neg(),
            BigInt.fromI32(0)
        );
    } else if (asset.assetType == "CashPayer") {
        // We invert the asset type here to handle netting
        return new AssetChange(
            asset.id,
            asset.cashMarket as string,
            "CashReceiver",
            asset.maturity,
            asset.notional,
            BigInt.fromI32(0)
        );
    } else if (asset.assetType == "CashReceiver") {
        return new AssetChange(
            asset.id,
            asset.cashMarket as string,
            "CashPayer",
            asset.maturity,
            asset.notional,
            BigInt.fromI32(0)
        );
    }

    throw new Error("Invalid asset type " + asset.assetType);
}

function includes(id: string, assetIds: string[]): bool {
    for (let i: i32 = 0; i < assetIds.length; i++) {
        if (assetIds[i] == id) return true;
    }

    return false;
}

function findAssetChanges(
    assetsBefore: Asset[],
    assetsAfter: string[],
    currentBlock: number
): AssetChange[] {
    let assetChanges = new Array<AssetChange>();

    for (let i: i32 = 0; i < assetsBefore.length; i++) {
        // Asset matured, we don't include it in the array.
        if (assetsBefore[i].maturity <= currentBlock) continue;

        if (includes(assetsBefore[i].id, assetsAfter)) {
            // Asset is still in the portfolio, we check if the notional has changed.
            let a = Asset.load(assetsBefore[i].id);
            if (a == null) {
                throw new Error("Asset " + assetsBefore[i].id + " not found");
            }

            if (assetsBefore[i].notional.notEqual(a.notional)) {
                // Notional has changed so we update the asset
                assetChanges.push(
                    new AssetChange(
                        a.id,
                        a.cashMarket as string,
                        a.assetType,
                        a.maturity,
                        a.notional.minus(assetsBefore[i].notional),
                        BigInt.fromI32(0)
                    )
                );
            }
        } else {
            // Asset was removed, we flip the asset type and add it to the change log
            assetChanges.push(makeAssetRemoval(assetsBefore[i]));
        }
    }

    let assetsBeforeIds = new Array<string>();
    for (let i: i32 = 0; i < assetsBefore.length; i++) {
        assetsBeforeIds.push(assetsBefore[i].id);
    }

    for (let i: i32 = 0; i < assetsAfter.length; i++) {
        if (!includes(assetsAfter[i], assetsBeforeIds)) {
            // Asset was added so push the change
            let a = Asset.load(assetsAfter[i]);
            if (a == null) {
                throw new Error("Asset " + assetsAfter[i] + " not found");
            }

            assetChanges.push(
                new AssetChange(
                    a.id,
                    a.cashMarket as string,
                    a.assetType,
                    a.maturity,
                    a.notional,
                    BigInt.fromI32(0)
                )
            );
        }
    }

    return assetChanges;
}

export function getAsset(address: Address, asset: AssetStruct): Asset {
    let assetId = getERC1155Token().encodeAssetId(
        asset.cashGroupId,
        asset.instrumentId,
        asset.maturity,
        asset.assetType
    );
    let id = address.toHexString() + ":" + assetId.toHexString();

    log.debug("Retrieving asset entity {}", [id]);

    let entity = Asset.load(id);
    if (entity == null) {
        entity = new Asset(id);
    }
    // We set this value here so that its accessible later
    entity.assetId = assetId;

    return entity as Asset;
}

export function updateAsset(
    asset: Asset,
    assetData: AssetStruct,
    data: ethereum.Event
): string {
    let fg = assetData.cashGroupId as i32;
    asset.cashGroup = fg.toString();

    asset.assetType = formatAssetType(assetData.assetType);
    asset.rate = assetData.rate.toI32();
    asset.notional = assetData.notional;

    // Calculated fields
    asset.maturity = assetData.maturity.toI32();
    let cashGroup = getCashGroup(asset.cashGroup);
    let cashMarket = getCashMarket(
        cashGroup.cashMarketContract as Address,
        asset.maturity
    );
    asset.cashMarket = cashMarket.id;

    asset.lastUpdateBlockNumber = data.block.number.toI32();
    asset.lastUpdateTimestamp = data.block.timestamp.toI32();
    asset.lastUpdateBlockHash = data.block.hash;
    asset.lastUpdateTransactionHash = data.transaction.hash;
    log.debug("Updated transaction variables for entity {}", [asset.id]);
    asset.save();
    log.debug("Updated asset entity {}", [asset.id]);

    return asset.id;
}
