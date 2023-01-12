// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DegenToken is ERC20, Ownable {
    
    constructor(string memory _name, string memory _symbol)
        ERC20(_name, _symbol) {}

    function mint(address _user, uint256 _amount) public onlyOwner {
        _mint(_user, _amount);
    }
}
