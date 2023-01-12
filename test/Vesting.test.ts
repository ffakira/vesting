
import { BigNumber } from "@ethersproject/bignumber"
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { 
    createWhitelist,
    getWhitelist,
    ONE_MONTH 
} from "./utils"

type SafeBN = BigNumber | number | string

enum VestingError {
    OWNABLE = "Ownable: caller is not the owner",
    PAUSABLE = "Vesting: emergency pause",
    EMPTY_WHITELIST_PARAMS = "Vesting: params cannot be empty",
    NO_FUNDS = "Vesting: no funds to be withdrawn",
    LOCK_PERIOD = "Vesting: lock period have not passed"
}

describe("Core contracts", function() {
    beforeEach(async function() {
        [this.deployer, ...this.accounts] = await ethers.getSigners()

        const DegenToken = await ethers.getContractFactory("DegenToken")
        this.degenToken = await DegenToken.deploy("DegenToken", "DToken")

        const degenTokenAddress = (await this.degenToken.deployed()).address
        const Vesting = await ethers.getContractFactory("Vesting")
        this.vesting = await Vesting.deploy(degenTokenAddress, this.deployer.address)
    })

    describe("Deployment", function() {
        it("should set the deployer address for the smart contracts", async function() {
            const vestingOwner: string = await this.vesting.owner()
            expect(this.deployer.address).to.equal(vestingOwner)
        })

        it("should get the correct name and symbol for ERC20", async function() {
            const tokenName: string = await this.degenToken.name()
            const tokenSymbol: string = await this.degenToken.symbol()
            const totalSupply: SafeBN = await this.degenToken.totalSupply()

            expect("DegenToken").to.equal(tokenName)
            expect("DToken").to.equal(tokenSymbol)
            expect(0).to.equal(totalSupply as number)
        })

        it("should transfer the ownership to Vesting contract", async function() {
            const vestingAddress = (await this.vesting.deployed()).address
            expect(this.deployer.address).to.equal(await this.degenToken.owner())

            await expect(this.degenToken.transferOwnership(vestingAddress))
                .to.emit(this.degenToken, "OwnershipTransferred")
                .withArgs(this.deployer.address, vestingAddress)
            expect(vestingAddress).to.equal(await this.degenToken.owner())
        })
    })

    describe("Vesting", function() {
        it("should fail calling pause or unpause with a user address", async function() {
            await expect(this.vesting.connect(this.accounts[1]).togglePause())
                .to.be.revertedWith(VestingError.OWNABLE)

            await expect(this.vesting.connect(this.accounts[1]).pause())
                .to.be.revertedWith(VestingError.OWNABLE)

            await expect(this.vesting.connect(this.accounts[1]).unpause())
                .to.be.revertedWith(VestingError.OWNABLE)
        })

        it("should create a whitelist from a CSV file", async function() {
            const whitelist = await getWhitelist()
            await createWhitelist(this.vesting)

            const getBlockNumber = await ethers.provider.getBlockNumber()
            const getBlockTimestamp = (await ethers.provider.getBlock(getBlockNumber)).timestamp

            for (const address of whitelist[0]) {
                const [user_, amount_, lockPeriod_] = await this.vesting.getWhitelist(address)
                expect(address).to.equal(user_)
                expect(ethers.utils.parseEther("10000")).to.deep.equal(amount_)
                expect(BigNumber.from(getBlockTimestamp).add(BigNumber.from(ONE_MONTH))).to.deep.equal(lockPeriod_)
            }
        })

        it("should fail calling whitelist with a user address", async function() {
            await expect(this.vesting.connect(this.accounts[1])
                .whitelist([this.accounts[1].address], [ethers.utils.parseEther('10000')], [1]))
                .to.be.revertedWith(VestingError.OWNABLE)
        })

        it("should delist all the users from CSV file", async function() {
            const whitelist = await getWhitelist()
            await createWhitelist(this.vesting)

            await this.vesting.delist(whitelist[0])

            for (const address of whitelist[0]) {
                const [user_, amount_, lockPeriod_] = await this.vesting.getWhitelist(address)
                expect(address).to.equal(user_)
                expect(BigNumber.from(0)).to.deep.equal(amount_)
                expect(BigNumber.from(0)).to.deep.equal(lockPeriod_)
            }
        })

        it("should fail passing an empty address to delist", async function() {
            await expect(this.vesting.whitelist([], [], []))
                .to.be.revertedWith(VestingError.EMPTY_WHITELIST_PARAMS)
        })

        it("should fail calling delist with a user address", async function() {
            await expect(this.vesting.connect(this.accounts[1])
                .delist([this.accounts[1].address]))
                .to.be.revertedWith(VestingError.OWNABLE)
        })

        it("should allow users to claim token after one month", async function() {
            const vestingAddress = (await this.vesting.deployed()).address
            await this.degenToken.mint(vestingAddress, ethers.utils.parseEther("100000"))
            let balanceOf = await this.degenToken.balanceOf(vestingAddress)
            expect(ethers.utils.parseEther("100000")).to.deep.equal(balanceOf)

            await createWhitelist(this.vesting)
            await ethers.provider.send("evm_increaseTime", [ONE_MONTH + 1])
            await this.vesting.claim()
            
            const [user_, amount_] = await this.vesting.getWhitelist(this.deployer.address)
            expect(this.deployer.address).to.equal(user_)
            expect(BigNumber.from(0)).to.deep.equal(amount_)

            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(ethers.utils.parseEther("10000")).to.deep.equal(balanceOf)

            balanceOf = await this.degenToken.balanceOf(vestingAddress)
            expect(ethers.utils.parseEther("90000")).to.deep.equal(balanceOf)
        })

        it("should fail to claim tokens, lock period time have not passed", async function() {
            await createWhitelist(this.vesting)
            await expect(this.vesting.claim()).to.be.revertedWith(VestingError.LOCK_PERIOD)
        })

        it("should fail if the users already claimed tokens", async function() {
            const vestingAddress = (await this.vesting.deployed()).address
            await this.degenToken.mint(vestingAddress, ethers.utils.parseEther("100000"))
            await createWhitelist(this.vesting)
            await ethers.provider.send("evm_increaseTime", [ONE_MONTH + 1])
        })
    })
})
