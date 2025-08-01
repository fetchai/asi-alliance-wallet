import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "reactstrap";
import styles from "../style.module.scss";

function Introduction({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className={styles["dialog"]}
      style={{
        display: isOpen ? "flex" : "none",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles["content"]}>
        <div>
          <svg
            width="56"
            height="56"
            viewBox="0 0 56 56"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="0.571533"
              y="0.571411"
              width="54.8571"
              height="54.8571"
              rx="27.4286"
              fill="#040A18"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M27.7126 7.62996C27.0399 7.95914 27.5578 7.1176 20.1113 19.9841C18.924 22.0357 16.9653 25.4178 15.7586 27.5002C14.552 29.5826 13.4382 31.6223 13.2835 32.0328C12.879 33.1066 12.7997 34.6118 13.0812 35.8694C13.5541 37.9821 14.5248 40.3043 15.1032 40.7067C15.5119 40.9911 16.039 40.9564 16.4131 40.6203C16.5893 40.462 18.4244 37.4276 20.4911 33.877C22.5578 30.3263 25.9561 24.4944 28.0427 20.9173C30.1293 17.3402 31.9519 14.1542 32.093 13.8375C32.2893 13.3965 32.3376 13.0634 32.2992 12.4156C32.2438 11.4831 32.0888 11.1194 30.932 9.2072C30.3721 8.28141 30.0773 7.92718 29.6841 7.70718C29.0737 7.36573 28.3133 7.33581 27.7126 7.62996ZM32.9657 18.1824C32.2691 18.5484 32.0044 18.9269 29.8765 22.6011C28.199 25.4974 28.0245 25.9819 28.3289 26.898C28.5426 27.5414 29.0614 28.1168 29.6788 28.3954C30.1464 28.6064 30.5887 28.6301 34.0596 28.6301C37.5202 28.6301 37.9737 28.6059 38.4351 28.3971C39.0971 28.0978 39.86 27.2553 40.0345 26.6313C40.3686 25.4362 40.248 25.1235 37.9484 21.2212C36.1825 18.2244 35.9366 17.9912 34.4697 17.9219C33.6904 17.885 33.4537 17.926 32.9657 18.1824ZM23.9931 33.6915C23.1796 34.0941 23.0554 34.2594 21.3121 37.2604C19.6016 40.2048 19.4695 40.5069 19.4604 41.4947C19.4514 42.4653 19.995 43.6432 20.6974 44.1754C20.9527 44.3689 23.0502 45.4172 25.3586 46.5051C29.3246 48.374 29.6068 48.4864 30.4897 48.5474C31.3458 48.6064 31.4929 48.5782 32.2444 48.2108C33.2172 47.735 34.556 46.3994 35.0226 45.4391C35.4468 44.5663 35.4564 43.16 35.0443 42.2502C34.6318 41.3391 27.4128 34.12 26.4668 33.6725C25.6122 33.2682 24.8361 33.2742 23.9931 33.6915Z"
              fill="white"
            />
            <path
              d="M30.3138 33.5295C29.9466 32.6866 30.2406 31.8227 31.0665 31.3166C31.4716 31.0683 31.6694 31.0608 36.8909 31.0941C42.2614 31.1283 42.3002 31.1304 42.9686 31.4306C44.1626 31.9669 45.1834 33.3567 45.1879 34.4522C45.1926 35.6063 45.0257 35.8625 42.8359 38.0632C40.501 40.4097 39.9423 40.7819 38.7639 40.7773C37.5022 40.7723 37.1762 40.5358 33.6919 37.0976C31.9325 35.3614 30.4124 33.7558 30.3138 33.5295Z"
              fill="#2161FF"
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: "16px",
            margin: "24px 0 12px",
            color: "var(--font-secondary)",
          }}
        >
          Keystone is a top-notch hardware wallet for optimal security,
          user-friendly interface and extensive compatibility.
        </div>
        <div
          style={{
            marginBottom: "20px",
          }}
        >
          <a
            href="https://keyst.one/"
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: "underline",
              color: "var(--link-green)",
            }}
          >
            Learn more
          </a>
        </div>
        <Button color="primary" block size="lg" onClick={onClose}>
          OK
        </Button>
      </div>
    </div>,
    document.body
  );
}

export function KeystoneIntroduction({ className }: { className: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const onClick = (e: any) => {
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <React.Fragment>
      <span onClickCapture={onClick} className={className}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M9.99985 19.6C15.2923 19.6 19.5999 15.2925 19.5999 10C19.5999 4.70754 15.2923 0.4 9.99985 0.4C4.7074 0.4 0.399853 4.70754 0.399853 10C0.399853 15.2925 4.7074 19.6 9.99985 19.6ZM9.99985 18C5.5721 18 1.99985 14.4278 1.99985 10C1.99985 5.57225 5.5721 2 9.99985 2C14.4276 2 17.9999 5.57225 17.9999 10C17.9999 14.4278 14.4276 18 9.99985 18ZM9.99673 6.95156C10.6599 6.95156 11.0561 6.59775 11.0561 5.99375C11.0561 5.40095 10.6591 5.04844 9.99673 5.04844C9.33913 5.04844 8.94517 5.40095 8.94517 5.99375C8.94517 6.59775 9.33913 6.95156 9.99673 6.95156Z" />
          <path d="M10.8093 8.4L10.9702 14.8H9.02959L9.19053 8.4H10.8093Z" />
        </svg>
      </span>
      <Introduction isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </React.Fragment>
  );
}
