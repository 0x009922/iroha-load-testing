# Iroha Performance Testing

This is a small Deno project that I've been using to reproduce https://github.com/hyperledger-iroha/iroha/issues/5330.

It's state is raw and there is no intention to finalize to some level.

Here is a quick documentation.

## Running load testing

```shell
deno task run
```

To adjust parameters of the testing, change the constants at `src/mod.ts` and `src/producers/worker-simple.ts`.

Each test run is saved in a separate timestamp-ed directory in `./run`. It has all logs and configs.

## Analysis

There is [`analysis.livemd`](./analysis.livemd). It is a notebook for [Livebook](https://livebook.dev/). Install it and
open the notebook. There are some unorganised visualisations. It's condition is raw.
