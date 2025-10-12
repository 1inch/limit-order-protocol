# Conditionally include .env or .env.automation based on OPS_LAUNCH_MODE
ifeq ($(OPS_LAUNCH_MODE),auto)
-include .env.automation
else
-include .env
endif
export

OPS_NETWORK := $(subst ",,$(OPS_NETWORK))
OPS_CHAIN_ID := $(subst ",,$(OPS_CHAIN_ID))
OPS_DEPLOYMENT_METHOD := $(subst ",,$(OPS_DEPLOYMENT_METHOD))

CURRENT_DIR:=$(shell pwd)

FILE_DEPLOY_HELPERS:=$(CURRENT_DIR)/deploy/deploy-helpers.js
FILE_DEPLOY_FEE_TAKER:=$(CURRENT_DIR)/deploy/deploy-fee-taker.js
FILE_DEPLOY_LOP:=$(CURRENT_DIR)/deploy/deploy.js
FILE_DEPLOY_NATIVE_ORDER_FACTORY:=$(CURRENT_DIR)/deploy/deploy-native-order-factory.js

FILE_CONSTANTS_JSON:=$(CURRENT_DIR)/config/constants.json

IS_ZKSYNC := $(findstring zksync,$(OPS_NETWORK))

deploy-helpers:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_HELPERS) OPS_DEPLOYMENT_METHOD=$(if $(OPS_DEPLOYMENT_METHOD),$(OPS_DEPLOYMENT_METHOD),create3) validate-helpers deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-lop:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_LOP) validate-lop deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-fee-taker:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_FEE_TAKER) validate-fee-taker deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-native-order-factory:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_NATIVE_ORDER_FACTORY) validate-native-order-factory deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-impl:
		@{ \
		yarn deploy $(OPS_NETWORK) || exit 1; \
		}

# Validation targets
validate-common:
		@{ \
		$(MAKE) ID=OPS_NETWORK validate || exit 1; \
		$(MAKE) ID=OPS_CHAIN_ID validate || exit 1; \
		if [ "$(OPS_NETWORK)" = "hardhat" ]; then \
			$(MAKE) ID=MAINNET_RPC_URL validate || exit 1; \
		fi; \
		$(MAKE) ID=OPS_WETH_ADDRESS validate || exit 1; \
		$(MAKE) process-weth || exit 1; \
		}

validate-helpers:
		@{ \
		$(MAKE) validate-common || exit 1; \
		$(MAKE) ID=OPS_LOP_HELPER_CONFIGS validate || exit 1; \
		if [ "$(OPS_DEPLOYMENT_METHOD)" = "create3" ]; then \
			$(MAKE) ID=OPS_CREATE3_DEPLOYER_ADDRESS validate || exit 1; \
		fi; \
		if echo "$(OPS_LOP_HELPER_CONFIGS)" | grep -q 'OrderRegistrator' || echo "$(OPS_LOP_HELPER_CONFIGS)" | grep -q 'SafeOrderBuilder'; then \
			$(MAKE) ID=OPS_AGGREGATION_ROUTER_V6_ADDRESS validate || exit 1; \
		fi; \
		$(MAKE) process-router-v6 process-order-registrator process-create3-deployer || exit 1; \
		}

validate-fee-taker:
		@{ \
		$(MAKE) validate-common || exit 1; \
		$(MAKE) ID=OPS_AGGREGATION_ROUTER_V6_ADDRESS validate || exit 1; \
		$(MAKE) ID=OPS_ACCESS_TOKEN_ADDRESS validate || exit 1; \
		if [ "$(IS_ZKSYNC)" = "" ]; then \
			$(MAKE) ID=OPS_CREATE3_DEPLOYER_ADDRESS validate || exit 1; \
			$(MAKE) ID=OPS_FEE_TAKER_SALT validate || exit 1; \
		fi; \
		$(MAKE) process-router-v6 process-access-token process-fee-taker-salt process-create3-deployer || exit 1; \
		}

validate-native-order-factory:
		@{ \
		$(MAKE) validate-common || exit 1; \
		$(MAKE) ID=OPS_AGGREGATION_ROUTER_V6_ADDRESS validate || exit 1; \
		$(MAKE) ID=OPS_ACCESS_TOKEN_ADDRESS validate || exit 1; \
		if [ "$(IS_ZKSYNC)" = "" ]; then \
			$(MAKE) ID=OPS_CREATE3_DEPLOYER_ADDRESS validate || exit 1; \
			$(MAKE) ID=OPS_NATIVE_ORDER_SALT validate || exit 1; \
		fi; \
		$(MAKE) process-router-v6 process-access-token process-native-order-factory-salt process-create3-deployer || exit 1; \
		}

validate-lop:
		@$(MAKE) validate-common || exit 1

# Process constant functions for new addresses
process-create3-deployer:
		@if [ -n "$$OPS_CREATE3_DEPLOYER_ADDRESS" ]; then $(MAKE) OPS_GEN_VAL='$(OPS_CREATE3_DEPLOYER_ADDRESS)' OPS_GEN_KEY='create3Deployer' upsert-constant; fi

process-weth:
		@$(MAKE) OPS_GEN_VAL='$(OPS_WETH_ADDRESS)' OPS_GEN_KEY='weth' upsert-constant

process-router-v6:
		@if [ -n "$$OPS_AGGREGATION_ROUTER_V6_ADDRESS" ]; then $(MAKE) OPS_GEN_VAL='$(OPS_AGGREGATION_ROUTER_V6_ADDRESS)' OPS_GEN_KEY='routerV6' upsert-constant; fi

process-order-registrator:
		@if [ -n "$$OPS_ORDER_REGISTRATOR_ADDRESS" ]; then $(MAKE) OPS_GEN_VAL='$(OPS_ORDER_REGISTRATOR_ADDRESS)' OPS_GEN_KEY='orderRegistrator' upsert-constant; fi

process-access-token:
		@$(MAKE) OPS_GEN_VAL='$(OPS_ACCESS_TOKEN_ADDRESS)' OPS_GEN_KEY='accessToken' upsert-constant

process-fee-taker-salt:
		@if [ -n "$$OPS_FEE_TAKER_SALT" ]; then $(MAKE) OPS_GEN_VAL='$(OPS_FEE_TAKER_SALT)' OPS_GEN_KEY='feeTakerSalt' upsert-constant; fi

process-native-order-factory-salt:
		@if [ -n "$$OPS_NATIVE_ORDER_SALT" ]; then $(MAKE) OPS_GEN_VAL='$(OPS_NATIVE_ORDER_SALT)' OPS_GEN_KEY='nativeOrderSalt' upsert-constant; fi

process-permit2-witness-proxy-salt:
		@if [ -n "$$OPS_PERMIT2_WITNESS_PROXY_SALT" ]; then $(MAKE) OPS_GEN_VAL='$(OPS_PERMIT2_WITNESS_PROXY_SALT)' OPS_GEN_KEY='permit2WitnessProxySalt' upsert-constant; fi

upsert-constant:
		@{ \
		$(MAKE) ID=OPS_GEN_VAL validate || exit 1; \
		$(MAKE) ID=OPS_GEN_KEY validate || exit 1; \
		$(MAKE) ID=OPS_CHAIN_ID validate || exit 1; \
		tmpfile=$$(mktemp); \
		jq '.$(OPS_GEN_KEY)."$(OPS_CHAIN_ID)" = $(OPS_GEN_VAL)' $(FILE_CONSTANTS_JSON) > $$tmpfile && mv $$tmpfile $(FILE_CONSTANTS_JSON); \
		echo "Updated $(OPS_GEN_KEY)[$(OPS_CHAIN_ID)] = $(OPS_GEN_VAL)"; \
		}

deploy-skip-all:
		@{ \
		for secret in $(FILE_DEPLOY_HELPERS) \
			$(FILE_DEPLOY_LOP) \
			$(FILE_DEPLOY_FEE_TAKER); do \
			$(MAKE) OPS_CURRENT_DEP_FILE=$$secret deploy-skip; \
		done \
		}

deploy-skip:
		@sed -i '' 's/module.exports.skip.*/module.exports.skip = async () => true;/g' $(OPS_CURRENT_DEP_FILE)

deploy-noskip:
		@sed -i '' 's/module.exports.skip.*/module.exports.skip = async () => false;/g' $(OPS_CURRENT_DEP_FILE)

launch-hh-node:
		@{ \
		$(MAKE) ID=NODE_RPC validate || exit 1; \
		echo "Launching Hardhat node with RPC: $(NODE_RPC)"; \
		npx hardhat node --fork $(NODE_RPC) --vvvv --full-trace; \
		}

install: install-utils install-dependencies

install-utils:
		brew install yarn wget jq

install-dependencies:
		yarn

clean:
		@rm -Rf $(CURRENT_DIR)/deployments/$(OPS_NETWORK)/*


# Get deployed contract addresses from deployment files
get:
		@{ \
		$(MAKE) ID=PARAMETER validate || exit 1; \
		$(MAKE) ID=OPS_NETWORK validate || exit 1; \
		CONTRACT_FILE=""; \
		case "$(PARAMETER)" in \
			"OPS_FEE_TAKER_ADDRESS") CONTRACT_FILE="FeeTaker.json" ;; \
			"OPS_LOP_ADDRESS") CONTRACT_FILE="LimitOrderProtocol.json" ;; \
			"OPS_ORDER_REGISTRATOR_ADDRESS") CONTRACT_FILE="OrderRegistrator.json" ;; \
			"OPS_SAFE_ORDER_BUILDER_ADDRESS") CONTRACT_FILE="SafeOrderBuilder.json" ;; \
			"OPS_SERIES_NONCE_MANAGER_ADDRESS") CONTRACT_FILE="SeriesNonceManager.json" ;; \
			"OPS_PRIORITY_FEE_LIMITER_ADDRESS") CONTRACT_FILE="PriorityFeeLimiter.json" ;; \
			"OPS_CALLS_SIMULATOR_ADDRESS") CONTRACT_FILE="CallsSimulator.json" ;; \
			"OPS_NATIVE_ORDER_FACTORY_ADDRESS") CONTRACT_FILE="NativeOrderFactory.json" ;; \
			*) echo "Error: Unknown parameter $(PARAMETER)"; exit 1 ;; \
		esac; \
		DEPLOYMENT_FILE="$(CURRENT_DIR)/deployments/$(OPS_NETWORK)/$$CONTRACT_FILE"; \
		if [ ! -f "$$DEPLOYMENT_FILE" ]; then \
			echo "Error: Deployment file $$DEPLOYMENT_FILE not found"; \
			exit 1; \
		fi; \
		ADDRESS=$$(cat "$$DEPLOYMENT_FILE" | grep '"address"' | head -1 | sed 's/.*"address": *"\([^"]*\)".*/\1/'); \
		echo "$$ADDRESS"; \
		}

validate:
		@{ \
			VALUE=$$(echo "$${!ID}" | tr -d '"'); \
			if [ -z "$${VALUE}" ]; then \
				echo "$${ID} is not set (Value: '$${VALUE}')!"; \
				exit 1; \
			fi; \
		}

help:
	@echo "Available targets:"
	@echo "  install                Install utilities and dependencies"
	@echo "  install-utils          Install yarn and wget via brew"
	@echo "  install-dependencies   Install JS dependencies via yarn"
	@echo "  clean                  Remove deployments for current network"
	@echo "  deploy-helpers         Deploy helper contracts"
	@echo "  deploy-lop             Deploy LimitOrderProtocol contract"
	@echo "  deploy-fee-taker       Deploy FeeTaker contract"
	@echo "  deploy-native-order-factory Deploy NativeOrderFactory contract"
	@echo "  deploy-impl            Run deployment script for current file"
	@echo "  deploy-skip            Set skip=true in deployment file"
	@echo "  deploy-noskip          Set skip=false in deployment file"
	@echo "  deploy-skip-all        Set skip=true for all deployment files"
	@echo "  launch-hh-node         Launch Hardhat node with forked RPC"
	@echo "  get PARAMETER=...      Get deployed contract address by parameter"
	@echo "  help                   Show this help message"
	@echo ""
	@echo "Validation targets:"
	@echo "  validate-helpers       Validate environment for helpers deployment"
	@echo "  validate-fee-taker     Validate environment for FeeTaker deployment"
	@echo "  validate-lop           Validate environment for LOP deployment"
	@echo ""
	@echo "Process targets (update constants):"
	@echo "  process-create3-deployer"
	@echo "  process-weth"
	@echo "  process-router-v6"
	@echo "  process-order-registrator"
	@echo "  process-access-token"
	@echo ""
	@echo "Usage examples:"
	@echo "  make deploy-helpers OPS_NETWORK=mainnet OPS_CHAIN_ID=1"
	@echo "  make get PARAMETER=OPS_FEE_TAKER_ADDRESS OPS_NETWORK=mainnet"

.PHONY: \
install install-utils install-dependencies clean \
deploy-helpers deploy-lop deploy-fee-taker deploy-impl \
deploy-skip deploy-noskip deploy-skip-all deploy-native-order-factory \
get help \
validate-helpers validate-fee-taker validate-lop \
process-create3-deployer process-weth process-router-v6 process-order-registrator process-access-token \
process-fee-taker-salt process-permit2-witness-proxy-salt process-native-order-factory-salt \
upsert-constant validate validate-common launch-hh-node
