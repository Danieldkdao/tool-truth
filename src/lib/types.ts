import { Dispatch, SetStateAction } from "react";

export type ParamsId<T extends string> = {
  params: Promise<Record<T, string>>;
};
export type SetterType<T> = Dispatch<SetStateAction<T>>;
