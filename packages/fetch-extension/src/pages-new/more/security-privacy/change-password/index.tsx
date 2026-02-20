import React, { useState, useEffect } from "react";
import { PasswordInput } from "@components-v2/form";
import style from "./style.module.scss";
import { useIntl } from "react-intl";
import { Form } from "reactstrap";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import { useForm } from "react-hook-form";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useNotification } from "@components/notification";
import { useStore } from "../../../../stores";
import { useLoadingIndicator } from "@components/loading-indicator";
import { PasswordStrengthMeter } from "@components-v2/password-strength/password-strength-meter";
import { Checkbox } from "@components-v2/checkbox/checkbox";

interface FormData {
  newPassword: string;
  confirmPassword: string;
  currentPassword: string;
}

const passwordFields: (keyof FormData)[] = [
  "currentPassword",
  "newPassword",
  "confirmPassword",
];

const defaultValues = {
  newPassword: "",
  confirmPassword: "",
  currentPassword: "",
};

export const ChangePassword = observer(() => {
  const { isLoading, setIsLoading } = useLoadingIndicator();
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues,
    mode: "onChange",
    reValidateMode: "onChange",
  });
  const intl = useIntl();
  const navigate = useNavigate();
  const { keyRingStore } = useStore();
  const notification = useNotification();
  const { newPassword, currentPassword, confirmPassword } = watch();
  const [passwordCheckbox, setPasswordCheckbox] = useState(false);
  const [passwordStrengthScore, setPasswordStrengthScore] = useState(0);

  useEffect(() => {
    if (newPassword) {
      trigger("newPassword");
    }
  }, [currentPassword, trigger]);

  useEffect(() => {
    if (confirmPassword) {
      trigger("confirmPassword");
    }
  }, [newPassword, trigger]);

  const handleChangePassword = async (_data: FormData) => {
    try {
      const passwordValid = await keyRingStore.checkPassword(currentPassword);
      if (!passwordValid) {
        setError("currentPassword", {
          type: "manual",
          message: "Invalid Password",
        });
        return;
      }
      setIsLoading("change-password", true);
      await keyRingStore.updatePassword(currentPassword, newPassword);
      notification.push({
        type: "success",
        placement: "top-center",
        duration: 5,
        content: "Password changed successfully",
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
      reset();
      setIsLoading("change-password", false);
      navigate("/");
    } catch (e) {
      setIsLoading("change-password", false);
      notification.push({
        type: "danger",
        placement: "top-center",
        duration: 5,
        content: e?.message || "Unable to change password",
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    }
  };

  return (
    <HeaderLayout
      showBottomMenu={false}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      smallTitle={true}
      alternativeTitle="Change ASI Wallet Password"
      onBackButton={() => navigate(-1)}
    >
      <Form
        onSubmit={handleSubmit(handleChangePassword)}
        className={style["container"]}
      >
        <PasswordInput
          passwordLabel="Current Password"
          labelStyle={{
            marginTop: "5px",
          }}
          {...register("currentPassword", {
            required: intl.formatMessage({
              id: "register.create.input.password.error.required",
            }),
            setValueAs: (value: string) => value.trim(),
            validate: (password: string): string | undefined => {
              if (password.length < 8) {
                return intl.formatMessage({
                  id: "register.create.input.password.error.too-short",
                });
              }
            },
          })}
          placeholder="Current Password"
          error={errors.currentPassword && errors.currentPassword.message}
        />
        <PasswordInput
          passwordLabel="New Password"
          labelStyle={{
            marginTop: "5px",
          }}
          {...register("newPassword", {
            required: `New ${intl.formatMessage({
              id: "register.create.input.password.error.required",
            })}`,
            setValueAs: (value: string) => value.trim(),
            validate: (password: string): string | undefined => {
              if (password.length < 8) {
                return intl.formatMessage({
                  id: "register.create.input.password.error.too-short",
                });
              }
              if (currentPassword && currentPassword === password) {
                return "New password must be different";
              }
            },
          })}
          placeholder="New Password (min 8 characters)"
          error={errors.newPassword && errors.newPassword.message}
        />
        <PasswordInput
          passwordLabel="Confirm Password"
          labelStyle={{
            marginTop: "5px",
          }}
          {...register("confirmPassword", {
            required: intl.formatMessage({
              id: "register.create.input.confirm-password.error.required",
            }),
            setValueAs: (value: string) => value.trim(),
            validate: (confirmPassword: string): string | undefined => {
              if (confirmPassword !== newPassword) {
                return intl.formatMessage({
                  id: "register.create.input.confirm-password.error.unmatched",
                });
              }
            },
          })}
          placeholder="Confirm Password"
          error={errors.confirmPassword && errors.confirmPassword.message}
        />
        <div className="pt-2 space-y-1 text-sm">
          <PasswordStrengthMeter
            password={newPassword}
            onStrengthChange={(score) => setPasswordStrengthScore(score)}
          />
        </div>
        {passwordStrengthScore < 3 && newPassword.length >= 8 && (
          <Checkbox
            isChecked={passwordCheckbox}
            className="py-2"
            setIsChecked={setPasswordCheckbox}
            label="I understand this password is not strong and still want to continue."
          />
        )}
        <ButtonV2
          variant="dark"
          disabled={
            !newPassword ||
            !currentPassword ||
            !confirmPassword ||
            (!passwordCheckbox && passwordStrengthScore < 3) ||
            passwordFields.some((field) => !!errors?.[field]?.message) ||
            isLoading("change-password")
          }
          text="Change"
          type="submit"
          styleProps={{ marginBottom: "20px", height: "56px" }}
        />
      </Form>
    </HeaderLayout>
  );
});
