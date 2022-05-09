import chai, { expect } from 'chai'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'
import { Contract, BigNumber, constants, utils } from 'ethers'
import BalanceTree from '../src/balance-tree'
//import { ethers, waffle, network } from 'hardhat'

import Distributor from '../build/MerkleDistributor.json'
import TestERC20 from '../build/TestERC20.json'
import { parseBalanceMap } from '../src/parse-balance-map'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000"

describe('MerkleDistributor', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  //const provider = waffle.provider;

  const wallets = provider.getWallets()
  const [wallet0, wallet1] = wallets

  let token: Contract
  beforeEach('deploy token', async () => {
    token = await deployContract(wallet0, TestERC20, ['Token', 'TKN', 0], overrides)
  })

  describe('#token', () => {
    it('returns the token address', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, ZERO_BYTES32], overrides)
      expect(await distributor.token()).to.eq(token.address)
    })
  })

  describe('#merkleRoot', () => {
    it('returns the zero merkle root', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, ZERO_BYTES32], overrides)
      expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32)
    })
  })

  describe('#consentAndAgreeToTerms', () => {
    let distributor: Contract
    let tree: BalanceTree
    beforeEach('deploy', async () => {
      tree = new BalanceTree([
        { account: wallet0.address, amount: BigNumber.from(100) },
        { account: wallet1.address, amount: BigNumber.from(101) },
      ])
      distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
      await token.setBalance(distributor.address, 201)
    })

    it('fails for empty proof', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, ZERO_BYTES32], overrides)
      const termsHash = await distributor.termsHash(wallet0.address);
      await expect(distributor.connect(wallet0).consentAndAgreeToTerms(0, 10, termsHash, [])).to.be.revertedWith(
        'MerkleDistributor: Invalid proof.'
      )
    })

    it('fails for invalid index', async () => {
      const tree = new BalanceTree([
        { account: wallet0.address, amount: BigNumber.from(100) },
        { account: wallet1.address, amount: BigNumber.from(101) },
      ])
      const distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
      const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
      const termsHash = await distributor.termsHash(wallet0.address);
      await expect(distributor.connect(wallet0).consentAndAgreeToTerms(1, BigNumber.from(100), termsHash, proof0)).to.be.revertedWith(
        'MerkleDistributor: Invalid proof.'
      )
    })

    it('fails for invalid amount', async () => {
      const tree = new BalanceTree([
        { account: wallet0.address, amount: BigNumber.from(100) },
        { account: wallet1.address, amount: BigNumber.from(101) },
      ])
      const distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
      const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
      const termsHash = await distributor.termsHash(wallet0.address);
      await expect(distributor.connect(wallet0).consentAndAgreeToTerms(0, BigNumber.from(200), termsHash, proof0)).to.be.revertedWith(
        'MerkleDistributor: Invalid proof.'
      )
    })

    it('sets #isAgreedToTerms', async () => {
      const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
      let termsHash = await distributor.termsHash(wallet0.address);
      expect(await distributor.isAgreedToTerms(0)).to.eq(false)
      expect(await distributor.isAgreedToTerms(1)).to.eq(false)
      await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
      expect(await distributor.isAgreedToTerms(0)).to.eq(true)
      expect(await distributor.isAgreedToTerms(1)).to.eq(false)
    })

  })

  describe('#claim', () => {
    describe('basis checks', () => {
      let distributor: Contract
      let tree: BalanceTree
      beforeEach('deploy', async () => {
        tree = new BalanceTree([
          { account: wallet0.address, amount: BigNumber.from(100) },
          { account: wallet1.address, amount: BigNumber.from(101) },
        ])
        distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, 201)
      })


      it('emergency withdraw', async () => {
        const { timestamp: now } = await provider.getBlock('latest')
    
        expect((await token.balanceOf(wallet0.address)).toString()).to.eq('0')
    
        // get all tokens out
        const msg1 = "MerkleDistributor: to cannot be the 0x0 address";
        const msg2 = "Ownable: caller is not the owner";
    
        await expect(distributor.emergencyWithdraw(token.address, 100, NULL_ADDRESS)).to.be.revertedWith(msg1);
        await expect(distributor.connect(wallet1.address).emergencyWithdraw(token.address, 100, wallet0.address)).to.be.revertedWith(msg2);
    
        await distributor.emergencyWithdraw(token.address, 100, wallet0.address)
    
        let tokenBal = (await token.balanceOf(wallet0.address)).toString()
        await expect(BigNumber.from(tokenBal).toString()).to.be.eq("100")
      })
    
      it('fails when T&Cs not approved', async () => {
        const distributor = await deployContract(wallet0, Distributor, [token.address, ZERO_BYTES32], overrides)
        await expect(distributor.connect(wallet0).claim(0, 10, [])).to.be.revertedWith(
          'MerkleDistributor: T&C must be approved.'
        )
      })
  
      it('fails for empty proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        const termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
 
        await expect(distributor.connect(wallet0).claim(0, 100, [])).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })
  
      it('fails for invalid index', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        termsHash = await distributor.termsHash(wallet1.address);
        await distributor.connect(wallet1).consentAndAgreeToTerms(1, 101, termsHash, proof1, overrides)
 
        await expect(distributor.connect(wallet0).claim(1, 101, proof0)).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })

      it('cannot approve terms more than once', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)

        await expect(
          distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        ).to.be.revertedWith('MerkleDistributor: T&C already approved.')
      })
 
      it('cannot approve terms with wrong hash', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let wrongHash = await distributor.termsHash(wallet1.address);

        await expect(
          distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, wrongHash, proof0, overrides)
        ).to.be.revertedWith('MerkleDistributor: wrong hash for T&C.')
      })
 
    })

    describe('two account tree', () => {
      let distributor: Contract
      let tree: BalanceTree
      beforeEach('deploy', async () => {
        tree = new BalanceTree([
          { account: wallet0.address, amount: BigNumber.from(100) },
          { account: wallet1.address, amount: BigNumber.from(101) },
        ])
        distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, 201)
      })

      it('successful claim', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        
        let amt = await token.balanceOf(wallet0.address)
        //console.log(amt.toString())
        
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        await expect(distributor.connect(wallet0).claim(0, 100, proof0, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(0, wallet0.address, "100")

        amt = await token.balanceOf(wallet0.address)
        //console.log(amt.toString())

        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
        termsHash = await distributor.termsHash(wallet1.address);
        await distributor.connect(wallet1).consentAndAgreeToTerms(1, 101, termsHash, proof1, overrides)
        await expect(distributor.connect(wallet1).claim(1, 101, proof1, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(1, wallet1.address, 101)
      })

      it('transfers the token', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        expect(await token.balanceOf(wallet0.address)).to.eq(0)
        await distributor.connect(wallet0).claim(0, 100, proof0, overrides)
        expect(await token.balanceOf(wallet0.address)).to.eq(100)
      })

      it('must have enough to transfer', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        await token.setBalance(distributor.address, 99)
        await expect(distributor.connect(wallet0).claim(0, 100, proof0, overrides)).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance'
        )
      })

      it('sets #isClaimed', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        expect(await distributor.isClaimed(0)).to.eq(false)
        expect(await distributor.isClaimed(1)).to.eq(false)
        await distributor.connect(wallet0).claim(0, 100, proof0, overrides)
        expect(await distributor.isClaimed(0)).to.eq(true)
        expect(await distributor.isClaimed(1)).to.eq(false)
      })

      it('cannot allow two claims', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        await distributor.connect(wallet0).claim(0, 100, proof0, overrides)
        await expect(distributor.connect(wallet0).claim(0, 100, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Drop already claimed.'
        )
      })

      it('cannot claim more than once: 0 and then 1', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
        termsHash = await distributor.termsHash(wallet1.address);
        await distributor.connect(wallet1).consentAndAgreeToTerms(1, 101, termsHash, proof1, overrides)

        await distributor.connect(wallet0).claim(
          0,
          100,
          proof0,
          overrides
        )
        await distributor.connect(wallet1).claim(
          1,
          101,
          proof1,
          overrides
        )

        await expect(
          distributor.connect(wallet0).claim(0, 100, proof0, overrides)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.')
      })

      /*it('test reset', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)

        await distributor.connect(wallet0).claim(
          0,
          100,
          proof0,
          overrides
        )

        await expect(
          distributor.connect(wallet0).claim(0, 100, proof0, overrides)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.')

        await distributor.reset()
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)

        await distributor.connect(wallet0).claim(
          0,
          100,
          proof0,
          overrides
        )

      })*/

      it('cannot claim more than once: 1 and then 0', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
        termsHash = await distributor.termsHash(wallet1.address);
        await distributor.connect(wallet1).consentAndAgreeToTerms(1, 101, termsHash, proof1, overrides)

        await distributor.connect(wallet1).claim(
          1,
          101,
          proof1,
          overrides
        )
        await distributor.connect(wallet0).claim(
          0,
          100,
          proof0,
          overrides
        )

        await expect(
          distributor.connect(wallet1).claim(1, 101, proof1, overrides)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.')
      })

      it('cannot claim for address other than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)
        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
        termsHash = await distributor.termsHash(wallet1.address);
        await distributor.connect(wallet1).consentAndAgreeToTerms(1, 101, termsHash, proof1, overrides)

        await expect(distributor.connect(wallet1).claim(1, 101, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })

      it('cannot claim more than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)

        await expect(distributor.connect(wallet0).claim(0, 101, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })

      it('cannot claim less than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)

        await expect(distributor.connect(wallet0).claim(0, 99, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })

      it('gas', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(0, 100, termsHash, proof0, overrides)

        const tx = await distributor.connect(wallet0).claim(0, 100, proof0, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(79026)
      })
    })
    describe('larger tree', () => {
      let distributor: Contract
      let tree: BalanceTree
      beforeEach('deploy', async () => {
        tree = new BalanceTree(
          wallets.map((wallet, ix) => {
            return { account: wallet.address, amount: BigNumber.from(ix + 1) }
          })
        )
        distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, 201)
      })

      it('claim index 4', async () => {
        const proof = tree.getProof(4, wallets[4].address, BigNumber.from(5))
        let termsHash = await distributor.termsHash(wallets[4].address);
        await distributor.connect(wallets[4]).consentAndAgreeToTerms(4, 5, termsHash, proof, overrides)
        await expect(distributor.connect(wallets[4]).claim(4, 5, proof, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(4, wallets[4].address, 5)
      })

      it('claim index 9', async () => {
        const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10))
        let termsHash = await distributor.termsHash(wallets[9].address);
        await distributor.connect(wallets[9]).consentAndAgreeToTerms(9, 10, termsHash, proof, overrides)
        await expect(distributor.connect(wallets[9]).claim(9, 10, proof, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(9, wallets[9].address, 10)
      })

      it('gas', async () => {
        const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10))
        let termsHash = await distributor.termsHash(wallets[9].address);
        await distributor.connect(wallets[9]).consentAndAgreeToTerms(9, 10, termsHash, proof, overrides)
        const tx = await distributor.connect(wallets[9]).claim(9, 10, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(81520)
      })

      it('gas second down about 15k', async () => {
        const proof0 = tree.getProof(0, wallets[0].address, BigNumber.from(1))
        let termsHash = await distributor.termsHash(wallets[0].address);
        await distributor.connect(wallets[0]).consentAndAgreeToTerms(0, 1, termsHash, proof0, overrides)
        const proof1 = tree.getProof(1, wallets[1].address, BigNumber.from(2))
        termsHash = await distributor.termsHash(wallets[1].address);
        await distributor.connect(wallets[1]).consentAndAgreeToTerms(1, 2, termsHash, proof1, overrides)

        await distributor.connect(wallets[0]).claim(
          0,
          1,
          proof0,
          overrides
        )
        const tx = await distributor.connect(wallets[1]).claim(
          1,
          2,
          tree.getProof(1, wallets[1].address, BigNumber.from(2)),
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(66500)
      })
    })

    describe('realistic size tree', () => {
      let distributor: Contract
      let tree: BalanceTree
      const NUM_LEAVES = 100_000
      const NUM_SAMPLES = 25
      const elements: { account: string; amount: BigNumber }[] = []
      for (let i = 0; i < NUM_LEAVES; i++) {
        const node = { account: wallet0.address, amount: BigNumber.from(100) }
        elements.push(node)
      }
      tree = new BalanceTree(elements)

      it('proof verification works', () => {
        const root = Buffer.from(tree.getHexRoot().slice(2), 'hex')
        for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
          const proof = tree
            .getProof(i, wallet0.address, BigNumber.from(100))
            .map((el) => Buffer.from(el.slice(2), 'hex'))
          const validProof = BalanceTree.verifyProof(i, wallet0.address, BigNumber.from(100), proof, root)
          expect(validProof).to.be.true
        }
      })

      beforeEach('deploy', async () => {
        distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, constants.MaxUint256)
      })

      it('gas', async () => {
        const proof = tree.getProof(50000, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(50000, 100, termsHash, proof, overrides)

        const tx = await distributor.connect(wallet0).claim(50000, 100, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(92210)
      })
      it('gas deeper node', async () => {
        const proof = tree.getProof(90000, wallet0.address, BigNumber.from(100))
        let termsHash = await distributor.termsHash(wallet0.address);
        await distributor.connect(wallet0).consentAndAgreeToTerms(90000, 100, termsHash, proof, overrides)

        const tx = await distributor.connect(wallet0).claim(90000, 100, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(92146)
      })
      it('gas average random distribution', async () => {
        let total: BigNumber = BigNumber.from(0)
        let count: number = 0
        for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
          const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
          let termsHash = await distributor.termsHash(wallet0.address);
          await distributor.connect(wallet0).consentAndAgreeToTerms(i, 100, termsHash, proof, overrides)

          const tx = await distributor.connect(wallet0).claim(i, 100, proof, overrides)
          const receipt = await tx.wait()
          total = total.add(receipt.gasUsed)
          count++
        }
        const average = total.div(count)
        expect(average).to.eq(77635)
      })
      // this is what we gas golfed by packing the bitmap
      it('gas average first 25', async () => {
        let total: BigNumber = BigNumber.from(0)
        let count: number = 0
        for (let i = 0; i < 25; i++) {
          const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
          let termsHash = await distributor.termsHash(wallet0.address);
          await distributor.connect(wallet0).consentAndAgreeToTerms(i, 100, termsHash, proof, overrides)

          const tx = await distributor.connect(wallet0).claim(i, 100, proof, overrides)
          const receipt = await tx.wait()
          total = total.add(receipt.gasUsed)
          count++
        }
        const average = total.div(count)
        expect(average).to.eq(63384)
      })

      it('no double claims in random distribution', async () => {
        for (let i = 0; i < 25; i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))) {
          const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
          let termsHash = await distributor.termsHash(wallet0.address);
          await distributor.connect(wallet0).consentAndAgreeToTerms(i, 100, termsHash, proof, overrides)

          await distributor.connect(wallet0).claim(i, 100, proof, overrides)
          await expect(distributor.connect(wallet0).claim(i, 100, proof, overrides)).to.be.revertedWith(
            'MerkleDistributor: Drop already claimed.'
          )
        }
      })
    })
  })
/*
  describe('parseBalanceMap', () => {
    let distributor: Contract
    let claims: {
      [account: string]: {
        index: number
        amount: string
        proof: string[]
      }
    }
    beforeEach('deploy', async () => {
      const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
        [wallet0.address]: 200,
        [wallet1.address]: 300,
        [wallets[2].address]: 250,
      })
      expect(tokenTotal).to.eq('0x02ee') // 750
      claims = innerClaims
      distributor = await deployContract(wallet0, Distributor, [token.address, merkleRoot], overrides)
      await token.setBalance(distributor.address, tokenTotal)
    })

    it('check the proofs is as expected', () => {
      expect(claims).to.deep.eq({
        [wallet0.address]: {
          index: 0,
          amount: '0xc8',
          proof: ['0x2a411ed78501edb696adca9e41e78d8256b61cfac45612fa0434d7cf87d916c6'],
        },
        [wallet1.address]: {
          index: 1,
          amount: '0x012c',
          proof: [
            '0xbfeb956a3b705056020a3b64c540bff700c0f6c96c55c0a5fcab57124cb36f7b',
            '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
          ],
        },
        [wallets[2].address]: {
          index: 2,
          amount: '0xfa',
          proof: [
            '0xceaacce7533111e902cc548e961d77b23a4d8cd073c6b68ccf55c62bd47fc36b',
            '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
          ],
        },
      })
    })

    it('all claims work exactly once', async () => {
      for (let account in claims) {
        const claim = claims[account]
        await expect(distributor.connect(wallets[claim.index]).claim(claim.index, claim.amount, claim.proof, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(claim.index, account, claim.amount)
        await expect(distributor.connect(wallets[claim.index]).claim(claim.index, claim.amount, claim.proof, overrides)).to.be.revertedWith(
          'MerkleDistributor: Drop already claimed.'
        )
      }
      expect(await token.balanceOf(distributor.address)).to.eq(0)
    })
  })*/
})
