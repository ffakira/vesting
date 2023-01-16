// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IVesting.sol";
import "./Pausable.sol";

/**
 * @author Akira F. <ffakira>
 * @title Basic MerkleVesting Contract
 * @notice A basic vesting schedule, allow operators to verify 
 * merkle tree proof for whitelist users
 */
contract MerkleVesting is ReentrancyGuard, Ownable, IVesting, Pausable {
    using MerkleProof for bytes32;
    using SafeERC20 for IERC20;

    IERC20 degenToken;
    bytes32 public immutable merkleRoot;

    struct Whitelist {
        uint256 amount;
        uint256 lockPeriod;
        uint256 claimedAmount;
        uint256 updatedAt;
    }

    mapping(address => Whitelist) public userWhitelist;
    mapping(address => bool) public isWhitelist;
    mapping(address => bool) public blacklist;

    event Blacklist(address indexed _user, bool _blacklist);

    constructor(IERC20 _degenToken, bytes32 _merkleRoot) {
        degenToken = _degenToken;
        merkleRoot = _merkleRoot;
    }

    /**
     * @dev Second option is by providing the leaf node. The limitation,
     * you need to keep in track the user => leaf node to verify the proof.
     * @param _user provides an address
     * @param _amount provides an amount
     * @param _lockPeriod provides the total seconds of lock period time
     */
    function whitelist(
        address _user,
        uint256 _amount,
        uint256 _lockPeriod, 
        bytes32[] calldata merkleProof
    ) public nonReentrant {
        require(_user != address(0), "MerkleVesting: cannot be zero address");
        require(!blacklist[_user], "MerkleVesting: address is blacklisted");
        require(!isWhitelist[_user], "MerkleVesting: already whitelisted");

        bytes32 node = keccak256(abi.encodePacked(_user, _amount, _lockPeriod));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), "MerkleVesting: invalid proof");

        userWhitelist[_user].amount = _amount;
        userWhitelist[_user].lockPeriod = block.timestamp + _lockPeriod;
        userWhitelist[_user].updatedAt = block.timestamp + _lockPeriod;
        userWhitelist[_user].claimedAmount = 0;

        isWhitelist[_user] = true;
        emit WhitelistEvent(_user, _amount, _lockPeriod);
    }

    function addBlacklist(address _user) public onlyOwner {
        blacklist[_user] = true;
        emit Blacklist(_user, true);
    }

    function removeBlacklist(address _user) public onlyOwner {
        blacklist[_user] = false;
        emit Blacklist(_user, false);
    }

    function claim() public nonReentrant pausable {
        require(!blacklist[msg.sender], "MerkleVesting: address is blacklisted");
        require(block.timestamp > userWhitelist[msg.sender].lockPeriod, "MerkleVesting: lock period have not passed");
        require(calculateReward(msg.sender) != 0, "MerkleVesting: no funds to be withdrawn");
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
    function calculateReward(address _user) public virtual view returns (uint256 _totalReward) {
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
