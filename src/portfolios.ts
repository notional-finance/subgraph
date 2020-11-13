import {
    NewCashGroup,
    UpdateCashGroup,
    SettleAccount,
    SettleAccountBatch,
    SetMaxAssets,
    SetHaircuts
} from "../generated/Portfolios/Portfolios";
import { getSystemConfiguration, updateCashGroup } from "./common";
import { log } from "@graphprotocol/graph-ts";
import { getAccount, updateAccount } from "./account";

export function handleNewCashGroup(event: NewCashGroup): void {
    let id = event.params.cashGroupId as i32;
    updateCashGroup(id.toString(), event);
}

export function handleUpdateCashGroup(
    event: UpdateCashGroup
): void {
    let id = event.params.cashGroupId as i32;
    updateCashGroup(id.toString(), event);
}

export function handleSettleAccount(event: SettleAccount): void {
    let account = getAccount(event.params.account);
    updateAccount(account, event);
    log.info("Updated account entity {} for settling", [account.id]);
}

export function handleSettleAccountBatch(event: SettleAccountBatch): void {
    let accounts = event.params.accounts;
    for (let i: i32 = 0; i < accounts.length; i++) {
        let address = accounts[i];
        let account = getAccount(address);
        updateAccount(account, event);
        log.info("Updated account entity {} for settling", [account.id]);
    }
}

export function updateHaircuts(event: SetHaircuts): void {
    let systemConfiguration = getSystemConfiguration();
    let liquidityHaircut = event.params.liquidityHaircut;
    let fCashHaircut = event.params.fCashHaircut;
    let fCashMaxHaircut = event.params.fCashMaxHaircut;

    // Need to check that the parameters have actually changed in the contract.
    let isUpdated = false;
    if (systemConfiguration.liquidityHaircut != liquidityHaircut) {
        systemConfiguration.liquidityHaircut = liquidityHaircut;
        isUpdated = true;
    }

    if (systemConfiguration.fCashHaircut != fCashHaircut) {
        systemConfiguration.fCashHaircut = fCashHaircut;
        isUpdated = true;
    }

    if (systemConfiguration.fCashMaxHaircut != fCashMaxHaircut) {
        systemConfiguration.fCashMaxHaircut = fCashMaxHaircut;
        isUpdated = true;
    }

    if (isUpdated) {
        systemConfiguration.lastUpdateBlockNumber = event.block.number.toI32();
        systemConfiguration.lastUpdateTimestamp = event.block.timestamp.toI32();
        systemConfiguration.lastUpdateBlockHash = event.block.hash;
        systemConfiguration.lastUpdateTransactionHash = event.transaction.hash;
        log.debug("Updated transaction variables for entity {}", [
            systemConfiguration.id
        ]);
        systemConfiguration.save();
        log.info("Updated haircuts in system parameters", []);
    }
}

export function updateMaxAssets(event: SetMaxAssets): void {
    let systemConfiguration = getSystemConfiguration();
    let maxAssets = event.params.maxAssets;

    // Need to check that the parameters have actually changed in the contract.
    if (systemConfiguration.maxAssets != maxAssets) {
        systemConfiguration.maxAssets = maxAssets;

        systemConfiguration.lastUpdateBlockNumber = event.block.number.toI32();
        systemConfiguration.lastUpdateTimestamp = event.block.timestamp.toI32();
        systemConfiguration.lastUpdateBlockHash = event.block.hash;
        systemConfiguration.lastUpdateTransactionHash = event.transaction.hash;
        log.debug("Updated transaction variables for entity {}", [
            systemConfiguration.id
        ]);
        systemConfiguration.save();
        log.info("Updated max assets in system parameters", []);
    }
}
