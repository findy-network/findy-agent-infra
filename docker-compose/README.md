# Agency deployment to localhost with von-network

Agency microservices are deployed using docker-compose. Note that PWA-container that serves
the web wallet frontend is intended only for localhost usage as it serves purely static files that
have localhost URLs hardcoded.

## Run with von-network

[Von-network](https://github.com/bcgov/von-network) is an Indy Node network that you can setup
easily to your localhost computer. When using von-network, you can run interoperability scenarios
with different kind of Aries agents or between multiple Findy Agency installations.

1. Run `make up` and wait for a while to services startup. The command will launch both von-network
and Findy Agency to your localhost computer.

## Run with file ledger

File ledger is used in a single agency installation to simulate an actual decentralized ledger. When
using the file ledger, it is possible to execute only scenarios between agents residing in this
Findy Agency, so it is best suited for development time usage.

1. Remove the line mapping genesis file in volumes section:

    ```yml
    #       - ./conf/genesis.txt:/genesis.txt
    ```

1. Replace in docker-compose.yml following env variable values for core service as below:

    ```yml
        FCLI_POOL_GENESIS_TXN_FILE: ''
        FCLI_POOL_NAME: 'FINDY_FILE_LEDGER'
        FCLI_AGENCY_POOL_NAME: 'FINDY_FILE_LEDGER'
    ```

1. Run `docker-compose up`

## Test the installation

1. Open browser at http://localhost:3000. See [instructions for web wallet login](https://github.com/findy-network/findy-wallet-pwa#registerlogin).

1. Onboard agent using CLI:

    ```bash
    findy-agent-cli authn register --config config.yaml
    findy-agent-cli authn login --config config.yaml
    ```

    See more CLI usage instructions [here](https://github.com/findy-network/findy-agent-cli).
