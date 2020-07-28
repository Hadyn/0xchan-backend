pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

/**
 * A contract which contains the addresses of all of the most recently published contracts. This should only be
 * be used for the private testnet as the contracts should not be replaced afterward.
 */
contract ZchHub {
    address public owner;
    mapping(string => address) public contractAddresses;

    constructor() public {
        owner = msg.sender;
    }

    modifier isOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    function setContractAddress(string memory name, address addr) public isOwner {
        contractAddresses[name] = addr;
    }
}