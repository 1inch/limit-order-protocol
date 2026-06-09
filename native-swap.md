# Native Currency Support in 1inch Limit Order Protocol

## Overview

The 1inch Limit Order Protocol works with ERC-20 tokens, but doesn't handle native blockchain currency (ETH, BNB, MATIC, etc.). Native currencies cannot directly approve spending allowances or be transferred using standard ERC-20 interfaces. The `NativeOrderFactory` extension solve this problem by creating a proxy system that wraps native currency into WETH (Wrapped ETH) while maintaining full compatibility with the existing limit order infrastructure.

```mermaid
graph LR
    A[User with Native Currency] -->|Problem| B[Limit Order Protocol]
    B -->|Requires| C[ERC-20 Interface]
    
    A -->|Solution| D[NativeOrderFactory]
    D -->|Creates| E[Proxy Contract]
    E -->|Wraps to WETH| F[Compatible with Protocol]
    F --> B
```

## Architecture

The native order extension consists of two main contracts working in tandem:

1. **NativeOrderFactory**: The factory contract that deploys deterministic proxy clones
2. **NativeOrderImpl**: The implementation contract that handles WETH conversion and order management

## Order Creation Flow

When a user wants to create a limit order with native currency, the following sequence occurs:

```mermaid
sequenceDiagram
    participant User
    participant Factory as NativeOrderFactory
    participant Clone as Proxy Clone
    participant WETH
    participant LOP as Limit Order Protocol
    participant Resolver
    
    User->>+Factory: create(order) + {value: ETH}
    Note over Factory: Validate order parameters
    Factory->>Factory: Calculate deterministic address
    Factory->>Clone: Deploy clone (CREATE2)
    Factory->>Clone: depositAndApprove{value: ETH}()
    Clone->>WETH: deposit(ETH)
    WETH-->>Clone: WETH tokens
    Clone->>WETH: approve(LOP, amount)
    Clone-->>Factory: Success
    Factory->>Factory: Emit NativeOrderCreated event
    Factory-->>-User: Return clone address
    
    Note over User,Resolver: Order is now ready to be filled
    Resolver->>LOP: Fills the order
```

### Key Steps Explained:

1. **Order Validation**: The factory validates that:
   - The maker is the message sender
   - A valid receiver is specified
   - The native currency value matches the order's making amount

2. **Deterministic Clone Creation**: Uses CREATE2 with the order hash as salt, ensuring:
   - The same order always produces the same proxy address
   - Address can be predicted before deployment
   - Prevents duplicate orders

3. **WETH Conversion**: The proxy immediately:
   - Wraps the received native currency (e.g. ETH) into wrapped tokens (e.g. WETH)
   - Approves the Limit Order Protocol to spend the wrapped tokens

## Signature Validation (ERC-1271)

The proxy implements ERC-1271 to validate signatures without requiring private keys:

```mermaid
flowchart TD
    A[LOP requests signature validation] --> B[isValidSignature called on proxy]
    B --> D[Calculate expected proxy address from order hash]
    D --> E{Address matches?}
    E -->|No| F[Return invalid]
    E -->|Yes| G[Patch order maker to proxy address]
    G --> H[Calculate order hash]
    H --> I{Hash matches?}
    I -->|No| F
    I -->|Yes| J[Return valid signature selector]
    
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style J fill:#bfb,stroke:#333,stroke-width:2px
    style F fill:#fbb,stroke:#333,stroke-width:2px
```

This mechanism allows the proxy to "sign" orders without having a private key, using deterministic addressing as proof of validity.

## Cancellation Mechanisms

Native order can be cancelled either by Maker itself or by a Resolver. Cancellation by Resolver requires small part of native currency to compensate for gas costs and incentivize the cancellation.

##### User Cancellation
- Only the original order maker can cancel their own order
- Returns the full remaining wrapped token balance as native currency
- No time restrictions

##### Resolver Cancellation
- Requires holding the access token for the Resolver
- Only works on expired orders
- Provides gas compensation to the resolver (capped at `basefee * 30,000 * 1.1`)

```mermaid
flowchart TD
    A[Order Active] --> B{Who cancels?}
    B -->|Original Maker| C[cancelOrder]
    B -->|Resolver| D[cancelExpiredOrderByResolver]
    
    C --> E[Verify maker identity]
    E --> F[Withdraw WETH to ETH]
    F --> G[Send ETH to maker]
    
    D --> H{Order expired?}
    H -->|No| I[Revert]
    H -->|Yes| J{Cancellation delay passed?}
    J -->|No| I
    J -->|Yes| K[Calculate resolver reward]
    K --> L[Withdraw WETH to ETH]
    L --> M[Send reward to resolver]
    L --> N[Send remainder to maker]
    
    style A fill:#bbf,stroke:#333,stroke-width:2px
    style G fill:#bfb,stroke:#333,stroke-width:2px
    style M fill:#bfb,stroke:#333,stroke-width:2px
    style N fill:#bfb,stroke:#333,stroke-width:2px
    style I fill:#fbb,stroke:#333,stroke-width:2px
```

### Fund Recovery
The `rescueFunds` function allows recovery of accidentally sent tokens while protecting active order funds:
- For wrapped tokens: Only allows withdrawal of excess funds beyond the active order amount
- For other tokens: Direct transfer to specified recipient
- Restricted to resolver role for additional security