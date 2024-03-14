up: down von-up agency
up-d: down von-up agency-d

down: clone
	docker-compose down
	cd .docker/von-network && ./manage down

# resolve docker host similarly as is done in von-network
docker-host:
	@echo "#!/bin/bash\n" > ./get-docker-host.sh
	@curl -s --raw https://raw.githubusercontent.com/bcgov/DITP-DevOps/main/code/snippets/getDockerHost >> get-docker-host.sh
	@echo "\ngetDockerHost" >> ./get-docker-host.sh
	@chmod a+x ./get-docker-host.sh

clone:
	mkdir -p .docker
	-git clone https://github.com/bcgov/von-network .docker/von-network

von-up: clone
# TODO: ARM
	cd .docker/von-network && ./manage build && ./manage up

gen-cert: docker-host
	$(eval IP_ADDRESS=$(shell ./get-cert-host.sh))
	@echo $(IP_ADDRESS)
	@cat ./cert/client/conf.template > ./cert/client/cert.conf
	awk '{sub("<IP_ADDRESS>","$(IP_ADDRESS)")}1' ./cert/client/cert.conf > ./cert/client/cert.conf.tmp && \
		mv ./cert/client/cert.conf.tmp ./cert/client/cert.conf
	cd ./cert && ./gen.sh client
	@cat ./cert/server/conf.template > ./cert/server/cert.conf
	awk '{sub("<IP_ADDRESS>","$(IP_ADDRESS)")}1' ./cert/server/cert.conf > ./cert/server/cert.conf.tmp && \
		mv ./cert/server/cert.conf.tmp ./cert/server/cert.conf
	cd ./cert && ./gen.sh server

ledger-ready:
	./wait-for-ledger.sh
	curl http://localhost:9000/genesis > conf/genesis.txt

agency: gen-cert ledger-ready
	docker-compose up

agency-d: gen-cert ledger-ready
	docker-compose up -d

cli-login:
	-findy-agent-cli authn register --config config.yaml
	findy-agent-cli authn login --config config.yaml