import "./style.css";
import "./shims.js";

import { Buffer } from "buffer";
import {
  connect,
  keyStores,
  providers,
  transactions,
  utils,
  WalletConnection,
} from "near-api-js";

const network = {
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://testnet.nearblocks.io",
  indexerUrl: "https://testnet-api.kitwallet.app",
};

let _walletState: any;
const jsonRpcProvider = new providers.JsonRpcProvider({
  url: network.nodeUrl,
});

const setupWalletState = async (): Promise<any> => {
  const keyStore = new keyStores.BrowserLocalStorageKeyStore();

  const near = await connect({
    keyStore,
    walletUrl: "https://testnet.mynearwallet.com",
    ...network,
    headers: {},
  });

  const wallet = new WalletConnection(near, "near_app");

  return {
    wallet,
    keyStore,
  };
};

(async () => {
  _walletState = await setupWalletState();
})();

const signInButton = document.getElementById("sign-in")!;
const signTransactionButton = document.getElementById("sign-transaction")!;

signInButton.addEventListener("click", () => {
  _walletState.wallet.requestSignIn({
    contractId: "guest-book.testnet",
    methodNames: ["getMessages", "addMessage"],
  });
});

// Sign Transactions Failover provider
signTransactionButton.addEventListener("click", async () => {
  // Prepare transaction
  const receiverId = "guest-book.testnet";
  const newArgs = { text: "test" };
  const actions = [
    transactions.functionCall(
      "addMessage",
      Buffer.from(JSON.stringify(newArgs)),
      BigInt(10000000000000),
      BigInt(0),
    ),
  ];

  // The signed in account via My NEAR Wallet
  const account = await _walletState.wallet.account();
  const { networkId, signer } = account.connection;

  // Public Key of the signed-in account.
  const localKey = await signer.getPublicKey(account.accountId, networkId);

  // Create transactions with "nearApi.transactions.createTransaction";
  const accessKey = await account.accessKeyForTransaction(
    receiverId,
    actions,
    localKey,
  );

  if (!accessKey) {
    throw new Error(
      `Failed to find matching key for transaction sent to ${receiverId}`,
    );
  }

  const block = await jsonRpcProvider.block({ finality: "final" });
  const nonce = accessKey.access_key.nonce + BigInt(1);

  const tx = transactions.createTransaction(
    account.accountId,
    utils.PublicKey.from(accessKey.public_key),
    receiverId,
    nonce,
    actions,
    utils.serialize.base_decode(block.header.hash),
  );

  const encoded = tx.encode();
  const decoded = transactions.Transaction.decode(encoded);

  console.log({ originalTX: tx });
  console.log({ decodedTX: decoded });
  console.log({ publicKey: decoded.publicKey.toString() });

  const [, signedTx] = await transactions.signTransaction(
    tx,
    signer,
    account.accountId,
    networkId,
  );

  return;

  // Send Transaction
  try {
    await jsonRpcProvider.sendTransaction(signedTx);
    alert("Successfully sent signed tx");
  } catch (error: any) {
    alert(error?.message);
  }
});
