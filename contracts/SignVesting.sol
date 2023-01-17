// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IVesting.sol";
import "./Pausable.sol";

contract SignVesting is ReentrancyGuard, Ownable, IVesting, Pausable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    IERC20 degenToken;
    address public immutable signerAddress;

    struct Whitelist {
        uint256 amount;
        uint256 lockPeriod;
        uint256 claimedAmount;
        uint256 updatedAt;
    }

    mapping(address => Whitelist) public userWhitelist;
    mapping(address => bool) public blacklist;
    mapping(address => mapping(uint256 => bool)) public nonce;

    event Blacklist(address indexed _user, bool _blacklist);

    constructor(IERC20 _degenToken, address _signerAddress) {
        degenToken = _degenToken;
        signerAddress = _signerAddress;
    }

    function whitelist(
        address _user, 
        uint256 _amount, 
        uint256 _lockPeriod,
        uint256 _nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public nonReentrant pausable {
        require(!blacklist[_user], "SignVesting: address is blacklisted");
        require(!nonce[_user][_nonce], "SignVesting: nonce already been used");
        bytes32 hash = keccak256(abi.encodePacked(_user, _amount, _lockPeriod, _nonce));
        bytes32 hashMessage = hash.toEthSignedMessageHash();
        address ecRecover = ECDSA.recover(hashMessage, v, r, s);

        require(ecRecover == signerAddress, "SignVesting: invalid signature");
        userWhitelist[_user].amount = _amount;
        userWhitelist[_user].lockPeriod = block.timestamp + _lockPeriod;
        userWhitelist[_user].updatedAt = block.timestamp + _lockPeriod;
        userWhitelist[_user].claimedAmount = 0;

        nonce[_user][_nonce] = true;
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
        require(!blacklist[msg.sender], "SignVesting: address is blacklisted");
        require(block.timestamp > userWhitelist[msg.sender].lockPeriod, "SignVesting: lock period have not passed");
        require(calculateReward(msg.sender) != 0, "SignVesting: no funds to be withdrawn");
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

    /**
     * @dev if nonce already been used
     * @param _user address of user
     * @param _nonce an uint256 number if been used to verify the signature
     */
    function nonceUsed(address _user, uint256 _nonce) public view returns(bool _isUsed) {
        return nonce[_user][_nonce];
    }
}
