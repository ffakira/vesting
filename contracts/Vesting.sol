// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vesting is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 degenToken;
    address signer;
    bool emergencyPause;

    struct Whitelist {
        uint256 amount;
        uint256 lockPeriod;
    }

    mapping (address => Whitelist) public userWhitelist;

    event WhitelistEvent (
        address indexed _user,
        uint256 _amount,
        uint256 _lockPeriod
    );

    event ClaimEvent (
        address indexed _user,
        uint256 _amount,
        uint256 currentTime
    );

    event DelistEvent (
        address indexed _user
    );

    constructor(IERC20 _degenToken, address _signer) {
        degenToken = _degenToken;
        signer = _signer;
    }

    modifier pausable() {
        require(!emergencyPause, "Vesting: emergency pause");
        _;
    }

    function togglePause() public onlyOwner {
        emergencyPause = !emergencyPause;
    }

    function pause() public onlyOwner {
        emergencyPause = true;
    }

    function unpause() public onlyOwner {
        emergencyPause = false;
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

        for (uint256 i; i < _user.length; i++) {
            userWhitelist[_user[i]].amount = _amount[i];
            userWhitelist[_user[i]].lockPeriod = block.timestamp + _lockPeriod[i];

            emit WhitelistEvent(_user[i], _amount[i], _lockPeriod[i]);
        }
    }

    /**
     * @dev You can delist users before the start time
     * @param _user provides an address[] of users
     */
    function delist(address[] memory _user) public onlyOwner {
        require(_user.length != 0, "Vesting: no users provided");

        for (uint256 i; i < _user.length; i++) {
            delete userWhitelist[_user[i]];
            emit DelistEvent(_user[i]);
        }
    }

    function claim() public nonReentrant pausable {
        require(userWhitelist[msg.sender].amount > 0, "Vesting: no funds to be withdrawn");
        require(block.timestamp > userWhitelist[msg.sender].lockPeriod, "Vesting: lock period have not passed");
        _claim(msg.sender);
    }

    function _claim(address _user) internal {
        uint256 oldAmount = userWhitelist[_user].amount;
        userWhitelist[_user].amount = 0;
        IERC20(degenToken).safeTransfer(_user, oldAmount);
        emit ClaimEvent(_user, oldAmount, block.timestamp);
    }

    function getWhitelist(address _user) public view returns (
        address user_,
        uint256 amount_, 
        uint256 lockPeriod_
    ) {
        return (_user, userWhitelist[_user].amount, userWhitelist[_user].lockPeriod);
    }
}
