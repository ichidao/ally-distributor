// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.6.11;

import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IMerkleDistributor.sol";

contract MerkleDistributor is IMerkleDistributor, Ownable {

    using SafeERC20 for IERC20;

    address public immutable override token;
    bytes32 public immutable override merkleRoot;

    string constant public override termsAndConditions = "T&Cs are HERE";

    // This is a packed array of booleans.
    mapping(uint256 => uint256) private claimedBitMap;

    // This is a packed array of booleans.
    mapping(uint256 => uint256) private approvedBitMap;

    constructor(address token_, bytes32 merkleRoot_) public {
        token = token_;
        merkleRoot = merkleRoot_;
    }

    function termsHash(address account) public view override returns (bytes32) {
        return keccak256(abi.encode(account, termsAndConditions));
    }

    function isClaimed(uint256 index) public view override returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function isAgreedToTerms(uint256 index) public view override returns (bool) {
        uint256 approvedWordIndex = index / 256;
        uint256 approvedBitIndex = index % 256;
        uint256 approvedWord = approvedBitMap[approvedWordIndex];
        uint256 mask = (1 << approvedBitIndex);
        return approvedWord & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[claimedWordIndex] = claimedBitMap[claimedWordIndex] | (1 << claimedBitIndex);
    }

    function _setApproved(uint256 index) private {
        uint256 approvedWordIndex = index / 256;
        uint256 approvedBitIndex = index % 256;
        approvedBitMap[approvedWordIndex] = approvedBitMap[approvedWordIndex] | (1 << approvedBitIndex);
    }

    function emergencyWithdraw(IERC20 _token, uint256 amount, address to) external override onlyOwner {
        require(to != address(0), "MerkleDistributor: to cannot be the 0x0 address");
        _token.safeTransfer(to, amount);
        emit EmergencyWithdrawal(_token, amount, to);
    }

    function consentAndAgreeToTerms(uint256 index, uint256 amount, bytes32 terms, bytes32[] calldata merkleProof) external override {
        require(!isAgreedToTerms(index), 'MerkleDistributor: T&C already approved.');
        require(termsHash(msg.sender) == terms, 'MerkleDistributor: wrong hash for T&C.');

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, msg.sender, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'MerkleDistributor: Invalid proof.');

        // Mark it approved and remember the hash.
        _setApproved(index);
        
        emit AgreedToTerms(index, msg.sender, amount, terms);
    }

    function claim(uint256 index, uint256 amount, bytes32[] calldata merkleProof) external override {
        require(isAgreedToTerms(index), 'MerkleDistributor: T&C must be approved.');
        require(!isClaimed(index), 'MerkleDistributor: Drop already claimed.');

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, msg.sender, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'MerkleDistributor: Invalid proof.');

        // Mark it claimed and send the token.
        _setClaimed(index);
        require(IERC20(token).transfer(msg.sender, amount), 'MerkleDistributor: Transfer failed.');

        emit Claimed(index, msg.sender, amount);
    }
}
