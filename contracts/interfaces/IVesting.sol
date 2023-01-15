// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

interface IVesting {
    event WhitelistEvent (address indexed _user, uint256 _amount, uint256 _lockPeriod);
    event ClaimEvent (address indexed _user, uint256 _amount);
    event DelistEvent (address indexed _user);
    function calculateReward(address _user) external view returns (uint256);
    function getWhitelist(address _user) external view returns (address, uint256, uint256, uint256);
    function eligibleClaimAmount(address _user) external view returns (uint256);
}
