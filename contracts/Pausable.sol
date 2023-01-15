// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Pausable is Ownable {
    bool public emergencyPause;

    event PauseEvent(address indexed _user, bool _pause);
    event UnpauseEvent(address indexed _user, bool _pause);
    event TogglePauseEvent(address indexed _user, bool _pause);

    modifier pausable() {
        require(!emergencyPause, "Pausable: emergency pause");
        _;
    }

    /**
     * @dev Will invert the emergencyPause boolean
     */
    function togglePause() external onlyOwner {
        emergencyPause = !emergencyPause;
        emit TogglePauseEvent(_msgSender(), emergencyPause);
    }

    /**
     * @dev Will set emergencyPause to true
     */
    function pause() external onlyOwner {
        emergencyPause = true;
        emit PauseEvent(_msgSender(), emergencyPause);
    }

    /**
     * @dev Will set emergencyPause to false
     */
    function unpause() public onlyOwner {
        emergencyPause = false;
        emit UnpauseEvent(_msgSender(), emergencyPause);
    }
}
