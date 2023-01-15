import fs from "fs/promises"
import path from "path"
import { ethers } from "hardhat"
import { Contract } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

export const ZERO_ADDRESS = `0x${'0'.repeat(40)}`
export const WEI = 1e18
export const ONE_MONTH = 60 * 60 * 24 * 30
export const BLOCK_PER_SECOND = 26

export async function createWhitelist(vestingInstance: Contract): Promise<void> {
    const accounts = await ethers.getSigners()
    const addressList = accounts.map((account: SignerWithAddress) => account.address)
    await _createWhitelistCSV(addressList, 'test')

    const whitelist = await getWhitelist()
    whitelist[1] = whitelist[1].map(val => ethers.utils.parseEther(val)) as any
    await vestingInstance.whitelist(...whitelist)
}

/**
 * @dev returns back string[] from the csv
 */
async function _parseCSV(fileName: string, delimiter: string = ','): Promise<string[][]> {
    const file = await fs.readFile(path.join(__dirname, fileName), "utf8")
    const listAddress = file.split("\n")
    listAddress.pop()
    const arrListAddress = listAddress.map(val => {
        const [address, amount, lockPeriod] = val.split(delimiter)
        return [address.trim(), amount.trim(), lockPeriod.trim()]
    })
    return arrListAddress
}

/**
 * @dev This will create 3 seperate arrays: user, amount and lockPeriod,
 * to be used for Vesting.whitelist() smart contract.
 */
export async function getWhitelist(): Promise<string[][]> {
    const data = await _parseCSV('whitelist.csv')
    const arrUser: string[] = []
    const arrAmount: string[] = []
    const arrLockPeriod: string[] = []

    for (const row of data) {
        arrUser.push(row[0])
        arrAmount.push(row[1])
        arrLockPeriod.push(row[2])
    }

    return [arrUser, arrAmount, arrLockPeriod]
}

/**
 * @dev For smaller list of addresses you can get away using
 * a text file based (e.g.: `csv`, `json`, etc..). For a larger
 * address list, you should consider in using a lightweight
 * SQL like `sqlite3`.
 */
async function _createWhitelistCSV(addressList: string[], nodeEnv?: string) {
    const pathFile = path.join(__dirname, 'whitelist.csv')
    if (nodeEnv === 'test' && await _accessFile(pathFile)) {
        await fs.unlink(pathFile)
    }

    const generateCSV = []
    for (const account of addressList) {
        generateCSV.push(`${account}, 10000, ${ONE_MONTH.toString()}\n`)
    }

    try {
        await fs.access(pathFile, fs.constants.R_OK | fs.constants.W_OK)
        await fs.writeFile(pathFile, '')
    } catch (err) {
        if (err instanceof Error) {
            // no file, write it
            if (err.message.includes('ENOENT: no such file or directory, access')) {
                for (const data of generateCSV) {
                    await fs.appendFile(pathFile, data)
                    await _delay(10)
                }
            }
        }
    }
}

/** @dev just for precautions 👀 */
async function _accessFile(path: string): Promise<boolean> {
    try {
        await fs.access(path, fs.constants.R_OK)
        return true
    } catch (err) {
        return false
    }
}

async function _delay(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time))
}