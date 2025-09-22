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

FILE_CREATE3_DEPLOYER:=$(CURRENT_DIR)/deploy/constants/create3-deployer.js
FILE_ACCESS_TOKEN:=$(CURRENT_DIR)/deploy/constants/access-token.js
FILE_ORDER_REGISTRATOR:=$(CURRENT_DIR)/deploy/constants/order-registrator.js
FILE_ROUTER_V6:=$(CURRENT_DIR)/deploy/constants/router-v6.js
FILE_WETH:=$(CURRENT_DIR)/deploy/constants/weth.js

deploy-helpers:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_HELPERS) OPS_DEPLOYMENT_METHOD=$(if $(OPS_DEPLOYMENT_METHOD),$(OPS_DEPLOYMENT_METHOD),create3) validate-helpers deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-lop:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_LOP) validate-lop deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-fee-taker:
		@$(MAKE) OPS_CURRENT_DEP_FILE=$(FILE_DEPLOY_FEE_TAKER) validate-fee-taker deploy-skip-all deploy-noskip deploy-impl deploy-skip

deploy-impl:
		@{ \
		yarn deploy $(OPS_NETWORK) || exit 1; \
		}

# Validation targets
validate-helpers:
		@{ \
		if [ -z "$(OPS_NETWORK)" ]; then echo "OPS_NETWORK is not set!"; exit 1; fi; \
		if [ -z "$(OPS_CHAIN_ID)" ]; then echo "OPS_CHAIN_ID is not set!"; exit 1; fi; \
		if [ -z "$(OPS_CREATE3_DEPLOYER_ADDRESS)" ] && [ "$(OPS_DEPLOYMENT_METHOD)" = "create3" ]; then echo "OPS_CREATE3_DEPLOYER_ADDRESS is not set!"; exit 1; fi; \
		if [ -z "$(MAINNET_RPC_URL)" ] && [ "$(OPS_NETWORK)" = "hardhat" ]; then echo "MAINNET_RPC_URL is not set!"; exit 1; fi; \
		if [ -z "$(OPS_WETH_ADDRESS)" ]; then echo "OPS_WETH_ADDRESS is not set!"; exit 1; fi; \
		if [ -z "$(OPS_LOP_HELPER_NAMES)" ]; then echo "OPS_LOP_HELPER_NAMES is not set!"; exit 1; fi; \
		$(MAKE) process-weth process-router-v6 process-order-registrator process-create3-deployer; \
		}

validate-fee-taker:
		@{ \
		if [ -z "$(OPS_NETWORK)" ]; then echo "OPS_NETWORK is not set!"; exit 1; fi; \
		if [ -z "$(OPS_CHAIN_ID)" ]; then echo "OPS_CHAIN_ID is not set!"; exit 1; fi; \
		if [ -z "$(OPS_CREATE3_DEPLOYER_ADDRESS)" ] && [ "$(OPS_DEPLOYMENT_METHOD)" = "create3" ]; then echo "OPS_CREATE3_DEPLOYER_ADDRESS is not set!"; exit 1; fi; \
		if [ -z "$(MAINNET_RPC_URL)" ] && [ "$(OPS_NETWORK)" = "hardhat" ]; then echo "MAINNET_RPC_URL is not set!"; exit 1; fi; \
		if [ -z "$(OPS_WETH_ADDRESS)" ]; then echo "OPS_WETH_ADDRESS is not set!"; exit 1; fi; \
		if [ -z "$(OPS_AGGREGATION_ROUTER_V6_ADDRESS)" ]; then echo "OPS_AGGREGATION_ROUTER_V6_ADDRESS is not set!"; exit 1; fi; \
		if [ -z "$(OPS_ACCESS_TOKEN_ADDRESS)" ]; then echo "OPS_ACCESS_TOKEN_ADDRESS is not set!"; exit 1; fi; \
		$(MAKE) process-weth process-router-v6 process-access-token process-create3-deployer; \
		}

validate-lop:
		@{ \
		if [ -z "$(OPS_NETWORK)" ]; then echo "OPS_NETWORK is not set!"; exit 1; fi; \
		if [ -z "$(OPS_CHAIN_ID)" ]; then echo "OPS_CHAIN_ID is not set!"; exit 1; fi; \
		if [ -z "$(MAINNET_RPC_URL)" ] && [ "$(OPS_NETWORK)" = "hardhat" ]; then echo "MAINNET_RPC_URL is not set!"; exit 1; fi; \
		if [ -z "$(OPS_WETH_ADDRESS)" ]; then echo "OPS_WETH_ADDRESS is not set!"; exit 1; fi; \
		$(MAKE) process-weth; \
		}

# Process constant functions for new addresses
process-create3-deployer:
	@{ \
		if [ -n "$(OPS_CREATE3_DEPLOYER_ADDRESS)" ]; then \
			$(MAKE) OPS_GEN_VAL='$(OPS_CREATE3_DEPLOYER_ADDRESS)' OPS_GEN_FILE=$(FILE_CREATE3_DEPLOYER) upsert-constant; \
		fi; \
	}

process-weth:
		@$(MAKE) OPS_GEN_VAL='$(OPS_WETH_ADDRESS)' OPS_GEN_FILE=$(FILE_WETH) upsert-constant

process-router-v6:
	@{ \
		if [ -n "$(OPS_AGGREGATION_ROUTER_V6_ADDRESS)" ]; then \
			$(MAKE) OPS_GEN_VAL='$(OPS_AGGREGATION_ROUTER_V6_ADDRESS)' OPS_GEN_FILE=$(FILE_ROUTER_V6) upsert-constant; \
		fi; \
	}

process-order-registrator:
	@{ \
		if [ -n "$(OPS_ORDER_REGISTRATOR_ADDRESS)" ]; then \
			$(MAKE) OPS_GEN_VAL='$(OPS_ORDER_REGISTRATOR_ADDRESS)' OPS_GEN_FILE=$(FILE_ORDER_REGISTRATOR) upsert-constant; \
		fi; \
	}

process-access-token:
		@$(MAKE) OPS_GEN_VAL='$(OPS_ACCESS_TOKEN_ADDRESS)' OPS_GEN_FILE=$(FILE_ACCESS_TOKEN) upsert-constant

upsert-constant:
		@{ \
		if [ -z "$(OPS_GEN_VAL)" ]; then \
			echo "variable for file $(OPS_GEN_FILE) is not set!"; \
			exit 1; \
		fi; \
		if grep -q "$(OPS_CHAIN_ID)" $(OPS_GEN_FILE); then \
			sed -i '' 's|$(OPS_CHAIN_ID): .*|$(OPS_CHAIN_ID): $(OPS_GEN_VAL),|' $(OPS_GEN_FILE); \
			sed -i '' 's/"/'\''/g' $(OPS_GEN_FILE); \
		else \
			tmpfile=$$(mktemp); \
			awk '1;/module.exports = {/{print "    $(OPS_CHAIN_ID): $(subst ",\",$(OPS_GEN_VAL)),"}' $(OPS_GEN_FILE) > $$tmpfile && sed -i '' 's/"/'\''/g' $$tmpfile && mv $$tmpfile $(OPS_GEN_FILE); \
		fi \
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
		if [ -z "$(NODE_RPC)" ]; then \
			echo "NODE_RPC is not set!"; \
			exit 1; \
		fi; \
		echo "Launching Hardhat node with RPC: $(NODE_RPC)"; \
		npx hardhat node --fork $(NODE_RPC) --vvvv --full-trace; \
		}

install: install-utils install-dependencies

install-utils:
		brew install yarn wget

install-dependencies:
		yarn

clean:
		@rm -Rf $(CURRENT_DIR)/deployments/$(OPS_NETWORK)/*


# Get deployed contract addresses from deployment files
get:
		@{ \
		if [ -z "$(PARAMETER)" ]; then \
			echo "Error: PARAMETER is not set. Usage: make get PARAMETER=OPS_FEE_TAKER_ADDRESS"; \
			exit 1; \
		fi; \
		if [ -z "$(OPS_NETWORK)" ]; then \
			echo "Error: OPS_NETWORK is not set"; \
			exit 1; \
		fi; \
		CONTRACT_FILE=""; \
		case "$(PARAMETER)" in \
			"OPS_FEE_TAKER_ADDRESS") CONTRACT_FILE="FeeTaker.json" ;; \
			"OPS_LOP_ADDRESS") CONTRACT_FILE="LimitOrderProtocol.json" ;; \
			"OPS_ORDER_REGISTRATOR_ADDRESS") CONTRACT_FILE="OrderRegistrator.json" ;; \
			"OPS_SAFE_ORDER_BUILDER_ADDRESS") CONTRACT_FILE="SafeOrderBuilder.json" ;; \
			"OPS_SERIES_NONCE_MANAGER_ADDRESS") CONTRACT_FILE="SeriesNonceManager.json" ;; \
			"OPS_PRIORITY_FEE_LIMITER_ADDRESS") CONTRACT_FILE="PriorityFeeLimiter.json" ;; \
			"OPS_CALLS_SIMULATOR_ADDRESS") CONTRACT_FILE="CallsSimulator.json" ;; \
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

help:
	@echo "Available targets:"
	@echo "  install                Install utilities and dependencies"
	@echo "  install-utils          Install yarn and wget via brew"
	@echo "  install-dependencies   Install JS dependencies via yarn"
	@echo "  clean                  Remove deployments for current network"
	@echo "  deploy-helpers         Deploy helper contracts"
	@echo "  deploy-lop             Deploy LimitOrderProtocol contract"
	@echo "  deploy-fee-taker       Deploy FeeTaker contract"
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
deploy-skip deploy-noskip deploy-skip-all launch-hh-node \
get help \
validate-helpers validate-fee-taker validate-lop \
process-create3-deployer process-weth process-router-v6 process-order-registrator process-access-token \
upsert-constant