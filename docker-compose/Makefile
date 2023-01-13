VON_NETWORK_VERSION:=3826aca3b69b31365b73222ad056fa748c2e0532

up:  down von-up gen-cert agency

down: clone
	docker-compose down
	cd .docker/von-network && ./manage down

# resolve docker host similarly as is done in von-network
docker-host:
	@echo "#!/bin/bash\n" > ./get-docker-host.sh
	@curl -s --raw https://raw.githubusercontent.com/bcgov/DITP-DevOps/main/code/snippets/getDockerHost >> get-docker-host.sh
	@echo "\ngetDockerHost" >> ./get-docker-host.sh
	@chmod a+x ./get-docker-host.sh
export AGENGY_IP_ADDRESS="$(shell ./get-docker-host.sh)"

clone:
	mkdir -p .docker
	-git clone https://github.com/bcgov/von-network .docker/von-network
	cd .docker/von-network && git reset --hard $(VON_NETWORK_VERSION)

von-up: clone
#	cd .docker/von-network && ./manage build && ./manage up
# TODO: use von-network image when ARM is supported
	docker pull ghcr.io/lauravuo/von-network:latest
	-docker tag ghcr.io/lauravuo/von-network:latest von-network-base
	cd .docker/von-network && ./manage up

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

agency: docker-host ledger-ready
	docker-compose up --build


