
import { BigNumber } from "@ethersproject/bignumber"
import { expect } from "chai"
import hre from "hardhat"
import { ethers } from "hardhat"
import { 
    BLOCK_PER_SECOND,
    createWhitelist,
    getWhitelist,
    ONE_MONTH 
} from "./utils"

type SafeBN = BigNumber | number | string

enum VestingError {
    OWNABLE = "Ownable: caller is not the owner",
    PAUSABLE = "Pausable: emergency pause",
    EMPTY_WHITELIST_PARAMS = "Vesting: params cannot be empty",
    PARAMS_LENGTH_NOT_EQUAL = "Vesting: params length are not equal",
    CANNOT_DELIST = "Vesting: cannot delist after the lock period",
    NO_FUNDS = "Vesting: no funds to be withdrawn",
    LOCK_PERIOD = "Vesting: lock period have not passed"
}

describe("Pausable and Vesting contracts", function() {
    beforeEach(async function() {
        /**
         * @dev init contranct deployment instance
         */
        [this.deployer, ...this.accounts] = await ethers.getSigners()

        const DegenToken = await ethers.getContractFactory("DegenToken")
        this.degenToken = await DegenToken.deploy("DegenToken", "DToken")

        const degenTokenAddress = (await this.degenToken.deployed()).address
        const Vesting = await ethers.getContractFactory("Vesting")
        this.vesting = await Vesting.deploy(degenTokenAddress, this.deployer.address)
    })

    afterEach(async function() {
        /**
         * @dev Cleanup. Reset the state of hardhat env, for tests
         * that are dependent with `evm_mine`
         */
        await hre.network.provider.send("hardhat_reset") as Promise<any>
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

    describe("Pausable", function() {
        it("should fail calling pause or unpause with a user address", async function() {
            await expect(this.vesting.connect(this.accounts[1]).togglePause())
                .to.be.revertedWith(VestingError.OWNABLE)

            await expect(this.vesting.connect(this.accounts[1]).pause())
                .to.be.revertedWith(VestingError.OWNABLE)

            await expect(this.vesting.connect(this.accounts[1]).unpause())
                .to.be.revertedWith(VestingError.OWNABLE)
        })

        it("should fail if to claim tokens, when it is paused", async function() {
            await this.vesting.pause()
            await expect(this.vesting.claim()).to.be.revertedWith(VestingError.PAUSABLE)
        })

        it("should pause with the deployer address", async function() {
            let emergencyPause = await this.vesting.emergencyPause()
            expect(false).to.equal(emergencyPause)
            
            await expect(this.vesting.pause()).to.emit(this.vesting, "PauseEvent")
                .withArgs(this.deployer.address, true)
            emergencyPause = await this.vesting.emergencyPause()
            expect(true).to.equal(emergencyPause)
        })

        it("should unpause with the deployer address", async function() {
            let emergencyPause = await this.vesting.emergencyPause()
            expect(false).to.equal(emergencyPause)

            await expect(this.vesting.unpause()).to.emit(this.vesting, "UnpauseEvent")
                .withArgs(this.deployer.address, false)
            emergencyPause = await this.vesting.emergencyPause()
            expect(false).to.equal(emergencyPause)
        })

        it("should togglePause with the deployer address", async function() {
            let emergencyPause = await this.vesting.emergencyPause()
            expect(false).to.equal(emergencyPause)

            await expect(this.vesting.togglePause()).to.emit(this.vesting, "TogglePauseEvent")
                .withArgs(this.deployer.address, true)
            emergencyPause = await this.vesting.emergencyPause()
            expect(true).to.equal(emergencyPause)

            await expect(this.vesting.togglePause()).to.emit(this.vesting, "TogglePauseEvent")
                .withArgs(this.deployer.address, false)
            emergencyPause = await this.vesting.emergencyPause()
            expect(false).to.equal(emergencyPause)
        })
    })

    describe("Vesting", function() {
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

        it("should fail passing an uneven params to whitelist", async function() {
            const invalidAddressLength = [
                [this.accounts[0].address, this.accounts[1].address],
                new Array(3).fill(ethers.utils.parseEther("5000")),
                new Array(3).fill(ONE_MONTH)
            ]
            await expect(this.vesting.whitelist(...invalidAddressLength))
                .to.be.revertedWith(VestingError.PARAMS_LENGTH_NOT_EQUAL)

            const invalidAmountLength = [
                [this.accounts[0].address, this.accounts[2].address, this.accounts[3].address],
                new Array(2).fill(ethers.utils.parseEther("5000")),
                new Array(3).fill(ONE_MONTH)
            ]
            await expect(this.vesting.whitelist(...invalidAmountLength))
                .to.be.revertedWith(VestingError.PARAMS_LENGTH_NOT_EQUAL)

            const invalidLockPeriodLength = [
                [this.accounts[0].address, this.accounts[2].address, this.accounts[3].address],
                new Array(3).fill(ethers.utils.parseEther("5000")),
                new Array(2).fill(ONE_MONTH)
            ]
            await expect(this.vesting.whitelist(...invalidLockPeriodLength))
                .to.be.revertedWith(VestingError.PARAMS_LENGTH_NOT_EQUAL)
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

        it("should fail calling delist after lock period", async function() {
            await createWhitelist(this.vesting)
            await ethers.provider.send("evm_increaseTime", [ONE_MONTH + 1])
            await expect(this.vesting.delist([this.accounts[1].address]))
                .to.be.revertedWith(VestingError.CANNOT_DELIST)
        })

        it("should allow users to claim token after one month", async function() {
            let futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 5000)
            
            // transfer tokens to the vesting contract
            const vestingAddress = (await this.vesting.deployed()).address
            await this.degenToken.mint(vestingAddress, ethers.utils.parseEther("100000"))
            let balanceOf = await this.degenToken.balanceOf(vestingAddress)
            expect(ethers.utils.parseEther("100000")).to.deep.equal(balanceOf)

            await createWhitelist(this.vesting)
            await ethers.provider.send("evm_mine", [futureBlockTime])

            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(BigNumber.from(0)).to.deep.equal(balanceOf)

            // first claim: (partial claim)
            await this.vesting.claim()
            let calculateReward = await this.vesting.calculateReward(this.deployer.address)
            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(calculateReward).to.deep.equal(balanceOf)

            // second claim: (should limit to claim all tokens: 10000)
            futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 100_000)
            await ethers.provider.send("evm_mine", [futureBlockTime])
            const remainingReward = await this.vesting.eligibleClaimAmount(this.deployer.address)
            expect(ethers.utils.parseEther("10000")).to.deep.equal(remainingReward.add(balanceOf))

            await this.vesting.claim()
            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(ethers.utils.parseEther("10000")).to.deep.equal(balanceOf)

            const eligibleClaimAmount = await this.vesting.eligibleClaimAmount(this.deployer.address)
            expect(BigNumber.from("0")).to.deep.equal(eligibleClaimAmount)

            calculateReward = await this.vesting.calculateReward(this.deployer.address)
            expect(BigNumber.from("0")).to.deep.equal(calculateReward)
        })

        it("should calculate the correct reward given to the user", async function () {
            const futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 10_000)

            await createWhitelist(this.vesting)
            await ethers.provider.send("evm_mine", [futureBlockTime])

            const rewardPerSecond = ethers.utils.parseEther("10000").div(BigNumber.from(ONE_MONTH.toString()))
            const getBlockNumber = await ethers.provider.getBlockNumber()
            const blockTimestamp = (await ethers.provider.getBlock(getBlockNumber)).timestamp
            const updatedAt = (await this.vesting.getWhitelist(this.deployer.address)).updatedAt_
            const lastRewardPeriod = BigNumber.from(blockTimestamp).sub(updatedAt)
            const eligibleReward = lastRewardPeriod.mul(rewardPerSecond)

            const calculateReward = await this.vesting.calculateReward(this.deployer.address)
            expect(eligibleReward).to.deep.equal(calculateReward)
        })

        it("should fail to claim tokens, lock period time have not passed", async function() {
            await createWhitelist(this.vesting)
            await expect(this.vesting.claim()).to.be.revertedWith(VestingError.LOCK_PERIOD)
        })

        it("should fail if the users already claimed tokens", async function() {
            const futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 200_000)
            const vestingAddress = (await this.vesting.deployed()).address
            await this.degenToken.mint(vestingAddress, ethers.utils.parseEther("100000"))

            await createWhitelist(this.vesting)
            await ethers.provider.send("evm_mine", [futureBlockTime])

            await this.vesting.claim()
            await expect(this.vesting.claim()).to.be.revertedWith(VestingError.NO_FUNDS)
        })
    })
})
