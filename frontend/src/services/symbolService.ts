import {
  NetworkType,
  Deadline,
  Address,
  TransferTransaction,
  MosaicId,
  Mosaic,
  UInt64,
  PlainMessage,
  SignedTransaction,
  RepositoryFactoryHttp,
} from 'symbol-sdk';
import { firstValueFrom } from 'rxjs';
import { QRCodeGenerator, TransactionQR } from 'symbol-qr-library';
import { requestSign, setTransaction } from 'sss-module';

interface Network {
  networkType: NetworkType;
  epochAdjustment: number;
  generationHashSeed: string;
  nemesisSignerPublicKey: string;
  currencyMosaicId: string;
}

export class SymbolService {
  public network: Network = {
    networkType: NetworkType.MAIN_NET,
    epochAdjustment: 0,
    generationHashSeed: '',
    nemesisSignerPublicKey: '',
    currencyMosaicId: '',
  };
  public repo: RepositoryFactoryHttp;

  constructor() {
    this.repo = new RepositoryFactoryHttp(process.env.NEXT_PUBLIC_SYMBOL_NODE!);
  }

  public async init() {
    const networkRepo = this.repo.createNetworkRepository();
    const networkProperties = await firstValueFrom(networkRepo.getNetworkProperties());

    if (
      networkProperties.network.epochAdjustment === undefined ||
      networkProperties.network.generationHashSeed === undefined ||
      networkProperties.network.nemesisSignerPublicKey === undefined ||
      networkProperties.chain.currencyMosaicId === undefined
    )
      throw new Error('Some network properties are undefined');

    this.network = {
      networkType: networkProperties.network.identifier === 'mainnet' ? NetworkType.MAIN_NET : NetworkType.TEST_NET,
      epochAdjustment: parseInt(networkProperties.network.epochAdjustment.replace('s', ''), 10),
      generationHashSeed: networkProperties.network.generationHashSeed,
      nemesisSignerPublicKey: networkProperties.network.nemesisSignerPublicKey,
      currencyMosaicId: networkProperties.chain.currencyMosaicId.replace(/0x|'/g, ''),
    };
  }

  public async createPollTransaction(message: string): Promise<string> {
    const deadline = Deadline.create(this.network.epochAdjustment);
    const nemesisAddress = Address.createFromPublicKey(this.network.nemesisSignerPublicKey, this.network.networkType);
    const transferTransaction = TransferTransaction.create(
      deadline,
      nemesisAddress,
      [new Mosaic(new MosaicId(this.network.currencyMosaicId), UInt64.fromUint(0))],
      PlainMessage.create(message),
      this.network.networkType
    ).setMaxFee(100);

    setTransaction(transferTransaction);
    const signedTransaction = await requestSign();
    await this.announce(signedTransaction);
    return signedTransaction.hash;
  }

  public async announce(signedTransaction: SignedTransaction) {
    try {
      const transactionRepo = this.repo.createTransactionRepository();
      const result = await firstValueFrom(transactionRepo.announce(signedTransaction));
      console.log(result);
    } catch (error: any) {
      throw new Error('Cannot announce: ' + error.message);
    }
  }

  public async getCurrentHeight(): Promise<number> {
    const chainRepo = this.repo.createChainRepository();
    const chainInfo = await firstValueFrom(chainRepo.getChainInfo());
    return chainInfo.height.compact();
  }

  public async voteTransaction(title: string, hash: string, option: string, type: VoteType): Promise<string> {
    const deadline = Deadline.create(this.network.epochAdjustment);
    const nemesisAddress = Address.createFromPublicKey(this.network.nemesisSignerPublicKey, this.network.networkType);
    const vote: Vote = {
      title,
      hash,
      option,
    };
    const message = JSON.stringify({
      data: vote,
    });
    const transferTransaction = TransferTransaction.create(
      deadline,
      nemesisAddress,
      [new Mosaic(new MosaicId(this.network.currencyMosaicId), UInt64.fromUint(0))],
      PlainMessage.create(message),
      this.network.networkType
    ).setMaxFee(100);

    if (type === VoteType.SSS) {
      try {
        console.log(transferTransaction);
        setTransaction(transferTransaction);
        const signedTransaction = await requestSign();
        await this.announce(signedTransaction);
        return 'success: ' + signedTransaction.hash;
      } catch (error: any) {
        throw new Error(error.message);
      }
    } else if (type === VoteType.QR) {
      try {
        const qrCode: TransactionQR = QRCodeGenerator.createTransactionRequest(
          transferTransaction,
          this.network.networkType,
          this.network.generationHashSeed
        );
        return await firstValueFrom(qrCode.toBase64());
      } catch (error: any) {
        throw new Error(error.message);
      }
    }
    throw new Error('Invalid vote type');
  }
}

export enum VoteType {
  SSS,
  QR,
}

interface Vote {
  hash: string;
  title: string;
  option: string;
}
