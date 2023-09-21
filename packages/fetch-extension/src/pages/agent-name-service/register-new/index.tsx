import searchButton from "@assets/icon/search.png";
import { useNotification } from "@components/notification";
import { observer } from "mobx-react-lite";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { ANS_CONFIG } from "../../../config.ui.var";
import { registerDomain } from "../../../name-service/ans-api";
import { HeaderLayout } from "../../../new-layouts";
import { useStore } from "../../../stores";
import { PublicDomainDropdown } from "./public-domains-dropdown";
import style from "./style.module.scss";
import style2 from "../../fetch-name-service/domain-details/style.module.scss";
import { Web2 } from "./web2";
import { AgentAddressInput } from "./agent-input";
export const RegisterAgentDomains = observer(() => {
  const { chainStore, accountStore, queriesStore } = useStore();
  const current = chainStore.current;
  const account = accountStore.getAccount(current.chainId);
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
  const [agentAddressSearchValue, setAgentAddressSearchValue] = useState("");
  const [selectedPublicDomain, setSelectedPublicDomain] = useState("agent");
  const [isRegisterInProgress, setIsRegisterInProgress] = useState(false);
  const [selectedWebVersion, setSelectedWebVersion] = useState("web3");

  const notification = useNotification();
  const {
    queryPublicDomains,
    queryPermissions,
    queryDomainRecord,
    queryVaildateAgentAddress,
  } = queriesStore.get(current.chainId).ans;

  const { publicDomains = [] } = queryPublicDomains.getQueryContract(
    ANS_CONFIG[current.chainId].contractAddress
  );

  let domainAvailablityMessage;
  let domainAvailablity = false;

  function checkDomainRegistration(domain: string) {
    if (!searchValue.endsWith(`.${selectedPublicDomain}`))
      domain = `${searchValue}.${selectedPublicDomain}`;

    const currentChainId = current.chainId;
    const contractAddress = ANS_CONFIG[currentChainId].contractAddress;
    const parts = domain.split(".");
    let permissionsQueryDomain;
    let statusQueryDomain;
    if (parts.length === 2) {
      const { isAvailable, record } = queryDomainRecord.getQueryContract(
        contractAddress,
        domain
      );
      if (isAvailable && !record) {
        domainAvailablityMessage = `The domain is available`;
        domainAvailablity = true;
      } else {
        domainAvailablityMessage = `The domain is not available`;
        domainAvailablity = false;
      }
      return;
    } else if (parts.length > 2) {
      permissionsQueryDomain = parts.slice(parts.length - 2).join(".");
      statusQueryDomain = parts.slice(0, parts.length - 1).join(".");
      const { permissions } = queryPermissions.getQueryContract(
        contractAddress,
        account.bech32Address,
        permissionsQueryDomain
      );

      if (permissions === "admin") {
        const { isAvailable } = queryDomainRecord.getQueryContract(
          contractAddress,
          statusQueryDomain
        );
        if (isAvailable) {
          domainAvailablityMessage = `The domain is available`;
          domainAvailablity = true;
        } else {
          domainAvailablityMessage = `The domain is not available`;
          domainAvailablity = false;
        }
      } else {
        domainAvailablityMessage = `You do not own the domain`;
        domainAvailablity = false;
      }
    } else {
      domainAvailablityMessage = `Invalid domain`;
      return;
    }
  }
  checkDomainRegistration(searchValue);

  const handleInputChange = (e: any) => {
    const value = e.target.value;
    setSearchValue(value);
  };
  const { isFetching: isLoading, isValid: isValidAgentAddress } =
    queryVaildateAgentAddress.getQueryContract(
      ANS_CONFIG[current.chainId].validateAgentAddressContract,
      agentAddressSearchValue
    );
  const handleAgentAddressInputChange = (e: any) => {
    const value = e.target.value;
    setAgentAddressSearchValue(value);
  };

  const handleRegisterClick = async () => {
    try {
      let domain = searchValue;
      setIsRegisterInProgress(true);
      if (!searchValue.endsWith(`.${selectedPublicDomain}`))
        domain = `${searchValue}.${selectedPublicDomain}`;
      await registerDomain(
        current.chainId,
        account,
        agentAddressSearchValue,
        domain,
        notification
      );
      setIsRegisterInProgress(false);
      navigate(`/agent-name-service`, {
        state: {
          disclaimer:
            "New Domain additions can take upto 5 mins to take effect.",
        },
      });
    } catch (err) {
      setIsRegisterInProgress(false);
      console.error("Error minting domain:", err);
      notification.push({
        placement: "top-center",
        type: "warning",
        duration: 2,
        content: `transaction failed!`,
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
      navigate("/agent-name-service/register-new");
    }
  };

  return (
    <HeaderLayout
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={""}
      onBackButton={() => {
        navigate("/agent-name-service");
      }}
      showBottomMenu={true}
    >
      {isRegisterInProgress ? (
        <div className={style2["loader"]}>
          Loading Register Transaction
          <i className="fas fa-spinner fa-spin ml-2" />
        </div>
      ) : null}
      <div className={style["title"]}>Register new domain</div>
      <div className={style["radioContainer"]}>
        <label className={style["radioButton"]}>
          <input
            type="radio"
            value="web3"
            checked={selectedWebVersion === "web3"}
            onChange={() => setSelectedWebVersion("web3")}
          />
          Web3
        </label>
        <label>
          <input
            type="radio"
            value="web2"
            checked={selectedWebVersion === "web2"}
            onChange={() => setSelectedWebVersion("web2")}
          />
          Web2
        </label>
      </div>
      {selectedWebVersion === "web3" ? (
        <div>
          <div
            className={style["searchContainer"]}
            style={{
              border:
                !domainAvailablity &&
                searchValue !== "" &&
                searchValue.includes(".")
                  ? "1px solid var(--red-red-400, #D38989)"
                  : "1px solid rgba(255, 255, 255, 0.4)",
            }}
          >
            {isLoading ? (
              <i
                style={{ color: "white", width: "10px" }}
                className="fas fa-spinner fa-spin ml-2"
              />
            ) : searchValue === "" ? (
              <img src={searchButton} className={style["searchIcon"]} alt="" />
            ) : !domainAvailablity ? (
              <div className={style["domainTakenIcon"]}>!</div>
            ) : (
              <img
                src={require("@assets/svg/agent-domain-available.svg")}
                className={style["availableIcon"]}
                alt=""
              />
            )}
            <input
              className={style["searchInput"]}
              placeholder="Search a domain"
              type="text"
              value={searchValue}
              onChange={handleInputChange}
            />
            <PublicDomainDropdown
              publicDomains={publicDomains}
              selectedPublicDomain={selectedPublicDomain}
              setSelectedPublicDomain={setSelectedPublicDomain}
            />
          </div>
          {!domainAvailablity && searchValue !== "" && (
            <div
              style={{ position: "absolute", top: "283px" }}
              className={style["domainTakenText"]}
            >
              <div className={style["domainTakenIcon2"]}>!</div>
              {domainAvailablityMessage}
            </div>
          )}

          <AgentAddressInput
            agentAddressSearchValue={agentAddressSearchValue}
            handleAgentAddressInputChange={handleAgentAddressInputChange}
            isValidAgentAddress={isValidAgentAddress}
            domainAvailablity={domainAvailablity}
            searchValue={searchValue}
            isLoading={isLoading}
          />
          <button
            className={style["registerButton"]}
            disabled={!domainAvailablity || !isValidAgentAddress}
            onClick={() => {
              handleRegisterClick();
            }}
          >
            Register{" "}
            <img
              src={require("@assets/svg/arrow-right.svg")}
              className={style["registerIcon"]}
              alt=""
            />
          </button>
        </div>
      ) : (
        <Web2 />
      )}
    </HeaderLayout>
  );
});