// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IVesting.sol";
import "./Pausable.sol";

import "hardhat/console.sol";

/**
 * @author Akira F. <ffakira>
 * @title Basic Vesting Contract
 * @notice A basic vesting schedule, allow operators to batch whitelist
 */
contract Vesting is ReentrancyGuard, Ownable, IVesting, Pausable {
    using SafeERC20 for IERC20;

    IERC20 degenToken;
    address signer;

    struct Whitelist {
        uint256 amount;
        uint256 lockPeriod;
        uint256 claimedAmount;
        uint256 updatedAt;
    }

    mapping (address => Whitelist) public userWhitelist;

    constructor(IERC20 _degenToken, address _signer) {
        degenToken = _degenToken;
        signer = _signer;
    }

    /**
     * @dev First option is to manually add an address. The length of each param should be equal.
     * The limitation of making batch is that you will run into gas limit issues.
     * @param _user provides an address[] of users
     * @param _amount provides an uint256[] in wei
     * @param _lockPeriod provides the total seconds of lock period time
     */
    function whitelist(
        address[] memory _user, 
        uint256[] memory _amount, 
        uint256[] memory _lockPeriod
    ) public onlyOwner {
        require(
            _user.length != 0 &&
            _amount.length != 0 &&
            _lockPeriod.length != 0,
            "Vesting: params cannot be empty"
        );
        require(
            _user.length == _amount.length && 
            _user.length == _lockPeriod.length && 
            _amount.length == _lockPeriod.length, 
            "Vesting: params length are not equal"
        );

        for (uint256 i; i < _user.length;) {
            userWhitelist[_user[i]].amount = _amount[i];
            userWhitelist[_user[i]].lockPeriod = block.timestamp + _lockPeriod[i];
            userWhitelist[_user[i]].updatedAt = block.timestamp + _lockPeriod[i];
            userWhitelist[_user[i]].claimedAmount = 0;

            emit WhitelistEvent(_user[i], _amount[i], _lockPeriod[i]);
            unchecked { i++; }
        }
    }

    /**
     * @dev You can delist users before the start time
     * @param _user provides an address[] of users
     */
    function delist(address[] memory _user) public onlyOwner {
        require(block.timestamp < userWhitelist[msg.sender].lockPeriod, "Vesting: cannot delist after the lock period");
        require(_user.length != 0, "Vesting: no users provided");

        unchecked {
            for (uint256 i; i < _user.length; i++) {
                delete userWhitelist[_user[i]];
                emit DelistEvent(_user[i]);
            }
        }
    }

    function claim() public nonReentrant pausable {
        require(block.timestamp > userWhitelist[msg.sender].lockPeriod, "Vesting: lock period have not passed");
        require(calculateReward(msg.sender) != 0, "Vesting: no funds to be withdrawn");
        _claim(msg.sender);
    }

    function _claim(address _user) internal {
        uint256 eligibleReward = calculateReward(_user);
        uint256 oldAmount = userWhitelist[_user].claimedAmount;
        userWhitelist[_user].claimedAmount = eligibleReward + oldAmount;

        IERC20(degenToken).safeTransfer(_user, eligibleReward);
        emit ClaimEvent(_user, eligibleReward);
    }

    /**
     * @param _user address of user
     */
    function calculateReward(address _user) public view returns (uint256 _totalReward) {
        uint256 _claimAmount = eligibleClaimAmount(_user);
        uint256 _rewardPerSecond = userWhitelist[_user].amount / 30 days;

        if (block.timestamp >= userWhitelist[_user].lockPeriod) {
            uint256 _lastRewardPeriod = block.timestamp - userWhitelist[_user].updatedAt;
            uint256 _eligibleReward = _lastRewardPeriod * _rewardPerSecond;
            if (_eligibleReward >= _claimAmount) {
                return _claimAmount;
            } else {
                return _eligibleReward;
            }
        } else {
            return 0;
        }
    }

    /**
     * @param _user address of user
     */
    function getWhitelist(address _user) public view returns (
        address user_,
        uint256 amount_, 
        uint256 lockPeriod_,
        uint256 updatedAt_
    ) {
        return (_user, userWhitelist[_user].amount, userWhitelist[_user].lockPeriod, userWhitelist[_user].updatedAt);
    }

    /**
     * @dev total token left for the user to claim
     * @param _user address of user
     * @return _totalReward
     */
    function eligibleClaimAmount(address _user) public view returns (uint256 _totalReward) {
        uint256 claimAmount = userWhitelist[_user].amount - userWhitelist[_user].claimedAmount;
        return claimAmount;
    }
}
