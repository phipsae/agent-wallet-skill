import { createPublicClient, http } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { bundlerUrl, chain, rpcUrl } from "./config.js";

export function createUserOperationFeeEstimator() {
  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  return async () => {
    try {
      return (await pimlicoClient.getUserOperationGasPrice()).fast;
    } catch {
      const fees = await publicClient.estimateFeesPerGas();
      if (fees.maxFeePerGas && fees.maxPriorityFeePerGas) {
        return {
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        };
      }

      const gasPrice = await publicClient.getGasPrice();
      return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
      };
    }
  };
}
